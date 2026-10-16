import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { migrationsFolder } from "@pp/db"
import {
  CurrentUser,
  NotFound,
  ProjectScope,
  Slug,
  Validation
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Clock from "effect/Clock"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import type * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { Access } from "../access/Access"
import { testUser } from "../access/testing"
import { MalformedTicketDocument } from "../tickets/TicketDocs"
import type { TicketIndex } from "../tickets/TicketIndex"
import { Projects } from "./Projects"
import { projectsOnPostgres } from "./projectsOnPostgres"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

type InvitationGrantRow = Readonly<{
  id: string
  role: string
  status: string
  expires_at: Date
  grant_role: string | null
}>

type InvitationRow = Readonly<{
  id: string
  role: string
  status: string
  from_project: boolean
}>

type PendingInvitationRow = Readonly<{ role: string; grants: number }>

describe.skipIf(!databaseUrl)("project members", () => {
  const organizationId = randomUUID()
  const orgSlug = `members-${organizationId}`
  const projectId = randomUUID()
  const slug = Schema.decodeSync(Slug)(`members-${projectId}`)
  const pm = randomUUID()
  const second = randomUUID()
  const developer = randomUUID()
  const users = [pm, second, developer]
  const admin = randomUUID()
  let pool: Pool
  let projectsLayer: Layer.Layer<Projects | TicketIndex | Access>
  const unassignAttempts: Array<string> = []

  const runIn =
    (
      projectSlug: string,
      layer: () => typeof projectsLayer = () => projectsLayer
    ) =>
    (as: string) =>
    <A, E, R>(f: (projects: Projects["Service"]) => Effect.Effect<A, E, R>) =>
      Effect.flatMap(Projects, f).pipe(
        Effect.provideServiceEffect(
          ProjectScope,
          Effect.flatMap(Access, (access) =>
            access.project(orgSlug, projectSlug)
          ).pipe(Effect.provideService(CurrentUser, testUser(as)))
        ),
        Effect.provide(layer())
      )

  const run = runIn(slug)

  const createProject = (key: string) =>
    Effect.promise(async () => {
      const id = randomUUID()
      const projectSlug = `members-${id}`
      await pool.query(
        "INSERT INTO project_index (id,slug,organization_id,key,name,icon,color,created_by) VALUES ($1,$2,$3,$4,'Other','folder','#3b82f6',$5)",
        [id, projectSlug, organizationId, key, pm]
      )
      await pool.query(
        "INSERT INTO project_member (project_id,organization_id,user_id,role_id) VALUES ($1,$2,$3,'pm')",
        [id, organizationId, pm]
      )
      return { id, slug: projectSlug }
    })

  const roles = () =>
    run(pm)((projects) => projects.get()).pipe(
      Effect.map((detail) =>
        Object.fromEntries(detail.members.map((m) => [m.id, m.role]))
      )
    )

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("Test requires an isolated local database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), { migrationsFolder })
    for (const id of [...users, admin]) {
      await pool.query(
        'INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES ($1,$1,$2,now(),now())',
        [id, `${id}@example.test`]
      )
    }
    await pool.query(
      "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$1,$2,now())",
      [organizationId, orgSlug]
    )
    for (const [id, role] of [
      ...users.map((id) => [id, "member"] as const),
      [admin, "admin"] as const
    ]) {
      await pool.query(
        "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,$4,now())",
        [randomUUID(), organizationId, id, role]
      )
    }
    await pool.query(
      "INSERT INTO project_index (id,slug,organization_id,key,name,icon,color,created_by) VALUES ($1,$2,$3,'MEM','Members','folder','#3b82f6',$4)",
      [projectId, slug, organizationId, pm]
    )
    await pool.query(
      "INSERT INTO project_member (project_id,organization_id,user_id,role_id) VALUES ($1,$2,$3,'pm')",
      [projectId, organizationId, pm]
    )

    projectsLayer = projectsOnPostgres(databaseUrl, [...users, admin], {
      update: (orgSlug, projectSlug, ticketId) =>
        Effect.suspend(
          (): Effect.Effect<never, MalformedTicketDocument | NotFound> => {
            unassignAttempts.push(ticketId)
            return ticketId === "MEM-901"
              ? Effect.fail(
                  new MalformedTicketDocument({
                    orgSlug,
                    slug: projectSlug,
                    ticketId,
                    path: `${ticketId}.md`,
                    reason: "frontmatter",
                    cause: null
                  })
                )
              : Effect.fail(new NotFound())
          }
        )
    })
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id=$1", [organizationId])
      await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [
        [...users, admin]
      ])
      await pool.end()
    }
  })

  it.effect("adds org members as developer and promotes them to pm", () =>
    Effect.gen(function* () {
      yield* run(pm)((projects) =>
        projects.addMember({
          email: `${developer}@example.test`,
          role: "developer"
        })
      )
      yield* run(pm)((projects) =>
        projects.addMember({
          email: `${second}@example.test`,
          role: "developer"
        })
      )
      yield* run(pm)((projects) => projects.updateMember(second, "pm"))
      expect(yield* roles()).toStrictEqual({
        [pm]: "pm",
        [second]: "pm",
        [developer]: "developer"
      })
    })
  )

  it.effect(
    "lets an org admin without a project role read the project and manage its members",
    () =>
      Effect.gen(function* () {
        const detail = yield* run(admin)((projects) => projects.get())
        expect(detail.members.map((member) => member.id)).not.toContain(admin)
        expect(detail.permissions).toMatchObject({
          ticket: ["read"],
          members: ["manage"]
        })
        yield* run(admin)((projects) =>
          projects.updateMember(developer, "client")
        )
        expect((yield* roles())[developer]).toBe("client")
        yield* run(admin)((projects) =>
          projects.updateMember(developer, "developer")
        )
      })
  )

  it.effect("lets a developer edit the project docs but not its settings", () =>
    Effect.gen(function* () {
      const edited = yield* run(developer)((projects) =>
        projects.update({ body: "# About\n\nWritten by a developer.\n" })
      )
      expect(edited.body).toContain("Written by a developer.")
      const refused = [
        yield* Effect.flip(
          run(developer)((projects) => projects.update({ name: "Renamed" }))
        ),
        yield* Effect.flip(
          run(developer)((projects) =>
            projects.update({ body: "# About\n", name: "Renamed" })
          )
        )
      ]
      expect(refused.map((error) => error._tag)).toStrictEqual([
        "Forbidden",
        "Forbidden"
      ])
    })
  )

  it.effect("lets an org admin add themselves as pm, edit, and leave", () =>
    Effect.gen(function* () {
      yield* run(admin)((projects) =>
        projects.addMember({ email: `${admin}@example.test`, role: "pm" })
      )
      const renamed = yield* run(admin)((projects) =>
        projects.update({ name: "Renamed by admin" })
      )
      expect(renamed.name).toBe("Renamed by admin")
      yield* run(admin)((projects) => projects.leave())
      expect((yield* roles())[admin]).toBeUndefined()
    })
  )

  it.effect("hides GitHub from a client's project detail", () =>
    Effect.gen(function* () {
      yield* run(pm)((projects) => projects.updateMember(developer, "client"))
      const detail = yield* run(developer)((projects) => projects.get())
      expect(detail.github).toBeNull()
      expect(detail.permissions.github).toBeUndefined()
      yield* run(pm)((projects) =>
        projects.updateMember(developer, "developer")
      )
    })
  )

  const outsider = () => `${randomUUID()}@example.test`

  const invitationsFor = (email: string) =>
    Effect.promise(async () => {
      const { rows } = await pool.query<InvitationGrantRow>(
        `SELECT i.id, i.role, i.status, i.expires_at, g.role_id AS grant_role
         FROM invitation i
         LEFT JOIN project_invite_grant g ON g.invitation_id = i.id
         WHERE i.organization_id = $1 AND i.email = $2
         ORDER BY i.created_at`,
        [organizationId, email]
      )
      return rows
    })

  it.effect("lets a pm invite an outsider only as a client", () =>
    Effect.gen(function* () {
      const client = outsider()
      const dev = outsider()
      yield* run(pm)((projects) =>
        projects.addMember({ email: client, role: "client" })
      )
      const [invite] = yield* invitationsFor(client)
      expect(invite).toMatchObject({
        role: "guest",
        status: "pending",
        grant_role: "client"
      })
      const now = yield* Clock.currentTimeMillis
      const days = (invite.expires_at.getTime() - now) / 86_400_000
      expect(days).toBeGreaterThan(6.9)
      expect(days).toBeLessThanOrEqual(7)

      const refused = yield* Effect.flip(
        run(pm)((projects) =>
          projects.addMember({ email: dev, role: "developer" })
        )
      )
      expect(refused._tag).toBe("Forbidden")
      expect(yield* invitationsFor(dev)).toStrictEqual([])

      yield* run(admin)((projects) =>
        projects.addMember({ email: dev, role: "developer" })
      )
      expect(yield* invitationsFor(dev)).toMatchObject([
        { role: "member", grant_role: "developer" }
      ])
    })
  )

  it.effect("never revives an expired invitation", () =>
    Effect.gen(function* () {
      const email = outsider()
      const expiredAt = DateTime.toDate(
        DateTime.subtract(yield* DateTime.now, { days: 1 })
      )
      yield* Effect.promise(() =>
        pool.query(
          "INSERT INTO invitation (id,organization_id,email,role,status,expires_at,inviter_id) VALUES ($1,$2,$3,'member','pending',$4,$5)",
          [randomUUID(), organizationId, email, expiredAt, admin]
        )
      )
      yield* run(pm)((projects) =>
        projects.addMember({ email, role: "client" })
      )
      const [expired, fresh] = yield* invitationsFor(email)
      expect(expired).toMatchObject({ role: "member", grant_role: null })
      expect(expired.expires_at.getTime()).toBe(expiredAt.getTime())
      expect(fresh).toMatchObject({ role: "guest", grant_role: "client" })
    })
  )

  it.effect(
    "lets a pm cancel the project's invitations and hides invitees from non-managers",
    () =>
      Effect.gen(function* () {
        const client = outsider()
        const dev = outsider()
        yield* run(pm)((projects) =>
          projects.addMember({ email: client, role: "client" })
        )
        yield* run(admin)((projects) =>
          projects.addMember({ email: dev, role: "developer" })
        )
        const detail = yield* run(pm)((projects) => projects.get())
        const pending = (email: string) =>
          detail.pendingMembers.find((member) => member.email === email)!
        const developerView = yield* run(developer)((projects) =>
          projects.get()
        )
        expect(developerView.pendingMembers).toStrictEqual([])

        yield* run(pm)((projects) =>
          projects.cancelPendingMember(pending(dev).invitationId)
        )
        yield* run(pm)((projects) =>
          projects.cancelPendingMember(pending(client).invitationId)
        )
        expect(yield* invitationsFor(dev)).toMatchObject([
          { status: "canceled", grant_role: null }
        ])
        expect(yield* invitationsFor(client)).toMatchObject([
          { status: "canceled", grant_role: null }
        ])
      })
  )

  it.effect("lets a pm step down while another pm remains", () =>
    Effect.gen(function* () {
      const stepped = yield* run(pm)((projects) =>
        projects.updateMember(pm, "developer")
      )
      expect(stepped.permissions.members).toBeUndefined()
      yield* run(second)((projects) => projects.updateMember(pm, "pm"))
      yield* run(pm)((projects) => projects.removeMember(second))
      expect((yield* roles())[pm]).toBe("pm")
    })
  )

  it.effect("never demotes the last pm or lets them leave", () =>
    Effect.gen(function* () {
      const demote = yield* Effect.flip(
        run(pm)((projects) => projects.updateMember(pm, "developer"))
      )
      const leave = yield* Effect.flip(run(pm)((projects) => projects.leave()))
      expect(demote).toMatchObject({
        _tag: "LastProjectPmBlocked",
        projectSlugs: [slug]
      })
      expect(leave).toMatchObject({ _tag: "LastProjectPmBlocked" })
      expect((yield* roles())[pm]).toBe("pm")
    })
  )

  it.effect("sends removing yourself through leave", () =>
    Effect.gen(function* () {
      const refused = yield* Effect.flip(
        run(developer)((projects) => projects.removeMember(developer))
      )
      expect(refused).toStrictEqual(new Validation({ reason: "remove_self" }))
      expect((yield* roles())[developer]).toBe("developer")
    })
  )

  it.effect(
    "tells someone without a project role there is nothing to leave",
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          run(admin)((projects) => projects.leave())
        )
        expect(error._tag).toBe("NotFound")
      })
  )

  it.effect("finishes leaving when a ticket can't be unassigned", () =>
    Effect.gen(function* () {
      yield* Effect.promise(() =>
        pool.query(
          "INSERT INTO ticket_index (organization_id,project_id,ticket_id,title,status,type,priority,assignees,created_by,created_at,updated_at) VALUES ($1,$2,'MEM-901','Broken','todo','feat','med',ARRAY[$3],$3,now(),now()), ($1,$2,'MEM-902','Fine','todo','feat','med',ARRAY[$3],$3,now(),now())",
          [organizationId, projectId, developer]
        )
      )
      unassignAttempts.length = 0
      yield* run(developer)((projects) => projects.leave())
      expect((yield* roles())[developer]).toBeUndefined()
      expect(unassignAttempts).toContain("MEM-901")
      yield* run(pm)((projects) =>
        projects.addMember({
          email: `${developer}@example.test`,
          role: "developer"
        })
      )
      yield* Effect.promise(() =>
        pool.query(
          "DELETE FROM ticket_index WHERE project_id = $1 AND ticket_id IN ('MEM-901','MEM-902')",
          [projectId]
        )
      )
    })
  )

  const invitationRow = (email: string) =>
    Effect.promise(async () => {
      const result = await pool.query<InvitationRow>(
        "SELECT id, role, status, from_project FROM invitation WHERE organization_id = $1 AND email = $2 ORDER BY created_at DESC LIMIT 1",
        [organizationId, email]
      )
      return result.rows[0]
    })

  it.live("derives a project invite's org role from its grants", () =>
    Effect.gen(function* () {
      const email = `sam-${projectId}@example.test`
      yield* run(admin)((projects) =>
        projects.addMember({ email, role: "developer" })
      )
      expect(yield* invitationRow(email)).toMatchObject({
        role: "member",
        from_project: true
      })
      yield* run(pm)((projects) =>
        projects.addMember({ email, role: "client" })
      )
      expect(yield* invitationRow(email)).toMatchObject({
        role: "guest",
        status: "pending"
      })
      const detail = yield* run(pm)((projects) => projects.get())
      expect(
        detail.pendingMembers
          .filter((pending) => pending.email === email)
          .map((pending) => pending.role)
      ).toStrictEqual(["client"])
    })
  )

  it.live("cancels a project invite once its last grant goes", () =>
    Effect.gen(function* () {
      const email = `cancel-${projectId}@example.test`
      yield* run(admin)((projects) =>
        projects.addMember({ email, role: "developer" })
      )
      const invite = yield* invitationRow(email)
      yield* run(pm)((projects) => projects.cancelPendingMember(invite.id))
      expect(yield* invitationRow(email)).toMatchObject({ status: "canceled" })
      yield* run(pm)((projects) =>
        projects.addMember({ email, role: "client" })
      )
      expect(yield* invitationRow(email)).toMatchObject({
        role: "guest",
        status: "pending",
        from_project: true
      })
    })
  )

  it.live(
    "keeps an org admin's member invite when a pm adds a client grant",
    () =>
      Effect.gen(function* () {
        const email = `org-${projectId}@example.test`
        yield* Effect.promise(() =>
          pool.query(
            "INSERT INTO invitation (id,organization_id,email,role,status,expires_at,inviter_id) VALUES ($1,$2,$3,'member','pending',now() + interval '7 days',$4)",
            [randomUUID(), organizationId, email, admin]
          )
        )
        yield* run(pm)((projects) =>
          projects.addMember({ email, role: "client" })
        )
        expect(yield* invitationRow(email)).toMatchObject({
          role: "member",
          from_project: false
        })
      })
  )

  it.live("re-derives project invites when a project is deleted", () =>
    Effect.gen(function* () {
      const doomed = yield* createProject("DOOM")
      const mixed = `mixed-${projectId}@example.test`
      const only = `only-${projectId}@example.test`
      const orgInvite = `org-invite-${projectId}@example.test`
      yield* run(admin)((projects) =>
        projects.addMember({ email: mixed, role: "client" })
      )
      yield* runIn(doomed.slug)(admin)((projects) =>
        projects.addMember({ email: mixed, role: "developer" })
      )
      yield* runIn(doomed.slug)(admin)((projects) =>
        projects.addMember({ email: only, role: "developer" })
      )
      yield* Effect.promise(async () => {
        const id = randomUUID()
        await pool.query(
          "INSERT INTO invitation (id,organization_id,email,role,status,expires_at,inviter_id) VALUES ($1,$2,$3,'member','pending',now() + interval '7 days',$4)",
          [id, organizationId, orgInvite, admin]
        )
        await pool.query(
          "INSERT INTO project_invite_grant (invitation_id,project_id,role_id) VALUES ($1,$2,'developer')",
          [id, doomed.id]
        )
      })
      expect(yield* invitationRow(mixed)).toMatchObject({ role: "member" })
      yield* runIn(doomed.slug)(pm)((projects) => projects.remove())
      expect(yield* invitationRow(mixed)).toMatchObject({
        role: "guest",
        status: "pending"
      })
      expect(yield* invitationRow(only)).toMatchObject({ status: "canceled" })
      expect(yield* invitationRow(orgInvite)).toMatchObject({
        role: "member",
        status: "pending",
        from_project: false
      })
    })
  )

  it.live("creates one invitation when two invites race", () =>
    Effect.gen(function* () {
      const other = yield* createProject("RACE")
      const email = `race-${projectId}@example.test`
      const secondLayer = projectsOnPostgres(databaseUrl!, [...users, admin])
      yield* Effect.all(
        [
          run(admin)((projects) =>
            projects.addMember({ email, role: "developer" })
          ),
          runIn(other.slug, () => secondLayer)(admin)((projects) =>
            projects.addMember({ email, role: "client" })
          )
        ],
        { concurrency: 2, discard: true }
      )
      const pending = yield* Effect.promise(() =>
        pool.query<PendingInvitationRow>(
          "SELECT role, (SELECT count(*)::int FROM project_invite_grant g WHERE g.invitation_id = i.id) AS grants FROM invitation i WHERE organization_id = $1 AND email = $2 AND status = 'pending'",
          [organizationId, email]
        )
      )
      expect(pending.rows).toStrictEqual([{ role: "member", grants: 2 }])
    })
  )

  it.live("leaves expired invites out of the pending members", () =>
    Effect.gen(function* () {
      const invitationId = randomUUID()
      yield* Effect.promise(async () => {
        await pool.query(
          "INSERT INTO invitation (id,organization_id,email,role,status,expires_at,inviter_id) VALUES ($1,$2,$3,'guest','pending',now() - interval '1 day',$4)",
          [
            invitationId,
            organizationId,
            `expired-${projectId}@example.test`,
            pm
          ]
        )
        await pool.query(
          "INSERT INTO project_invite_grant (invitation_id,project_id,role_id) VALUES ($1,$2,'client')",
          [invitationId, projectId]
        )
      })
      const detail = yield* run(pm)((projects) => projects.get())
      expect(
        detail.pendingMembers.map((pending) => pending.invitationId)
      ).not.toContain(invitationId)
    })
  )

  it.effect("ends project access when the org membership goes", () =>
    Effect.gen(function* () {
      yield* run(developer)((projects) => projects.key())
      yield* Effect.promise(() =>
        pool.query(
          "DELETE FROM member WHERE organization_id=$1 AND user_id=$2",
          [organizationId, developer]
        )
      )
      const error = yield* Effect.flip(
        run(developer)((projects) => projects.key())
      )
      expect(error._tag).toBe("NotFound")
    })
  )
})
