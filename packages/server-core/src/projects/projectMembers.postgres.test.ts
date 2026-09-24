import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import { GitHub } from "@pp/server-core/github/GitHub"
import { BannerPlaceholders } from "@pp/server-core/projects/BannerPlaceholders"
import { ProjectDocs } from "@pp/server-core/projects/ProjectDocs"
import { Projects } from "@pp/server-core/projects/Projects"
import { ProjectsLive } from "@pp/server-core/projects/ProjectsLive"
import { TicketDocs } from "@pp/server-core/tickets/TicketDocs"
import * as TicketDocumentLock from "@pp/server-core/tickets/ticketDocumentLock"
import { TicketIndexLive } from "@pp/server-core/tickets/TicketIndexLive"
import { Users } from "@pp/server-core/users/Users"
import { Slug } from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const unused = () => Effect.die(new Error("Unexpected dependency call"))

describe.skipIf(!databaseUrl)("project members", () => {
  const organizationId = randomUUID()
  const orgSlug = `members-${organizationId}`
  const projectId = randomUUID()
  const slug = Schema.decodeSync(Slug)(`members-${projectId}`)
  const pm = randomUUID()
  const second = randomUUID()
  const developer = randomUUID()
  const users = [pm, second, developer]
  let pool: Pool
  let projectsLayer: Layer.Layer<Projects>

  const run = <A, E>(
    f: (projects: Projects["Service"]) => Effect.Effect<A, E>
  ) => Effect.flatMap(Projects, f).pipe(Effect.provide(projectsLayer))

  const roles = () =>
    run((projects) => projects.get(orgSlug, pm, slug)).pipe(
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
    for (const id of users) {
      await pool.query(
        'INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES ($1,$1,$2,now(),now())',
        [id, `${id}@example.test`]
      )
    }
    await pool.query(
      "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$1,$2,now())",
      [organizationId, orgSlug]
    )
    for (const id of users) {
      await pool.query(
        "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'member',now())",
        [randomUUID(), organizationId, id]
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

    const db = DbLive.pipe(
      Layer.provideMerge(
        PgClient.layer({ url: Redacted.make(databaseUrl), maxConnections: 1 })
      )
    )
    const docs = Layer.succeed(TicketDocs, {
      listIds: () => Effect.succeed([]),
      read: unused,
      write: unused,
      update: unused,
      create: unused,
      remove: unused,
      readRaw: unused
    })
    projectsLayer = ProjectsLive.pipe(
      Layer.provide(
        TicketIndexLive.pipe(Layer.provide(db), Layer.provide(docs))
      ),
      Layer.provide(docs),
      Layer.provide(TicketDocumentLock.layer),
      Layer.provide(db),
      Layer.provide(
        Layer.succeed(BannerPlaceholders, {
          ensure: (_org, _slug, current) => Effect.succeed(current)
        })
      ),
      Layer.provide(
        Layer.succeed(ProjectDocs, {
          read: () =>
            Effect.succeed({
              slug,
              name: "Members",
              icon: "folder",
              color: "#3b82f6",
              createdAt: DateTime.toDateUtc(
                DateTime.makeUnsafe("2026-09-24T00:00:00Z")
              ),
              github: null,
              setup: {
                workflowReviewedAt: null,
                invitePeopleDismissedAt: null,
                connectGithubDismissedAt: null
              },
              templateDefaults: {},
              body: "Project body"
            }),
          write: () => Effect.void,
          writeTemplateDefaults: unused,
          removeDir: unused,
          readRaw: unused
        })
      ),
      Layer.provide(
        Layer.succeed(Users, {
          findByEmail: (email) =>
            Effect.succeed(
              users
                .filter((id) => `${id}@example.test` === email)
                .map((id) => ({ id, email, name: id, username: null }))[0] ??
                null
            ),
          findManyByIds: unused,
          fullByIds: unused
        })
      ),
      Layer.provide(
        Layer.succeed(GitHub, {
          verifyInstallationRepo: unused,
          getInstallationAccount: unused,
          listInstallationRepos: unused,
          exchangeAppUserCode: unused,
          appUserCanAccessInstallation: unused,
          createBranchAsUser: unused,
          openPullRequestAsUser: unused,
          fetchInstallationProjectStates: unused,
          listInstallationBranches: unused,
          branchExistsInstallation: unused
        })
      ),
      Layer.orDie
    )
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id=$1", [organizationId])
      await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [users])
      await pool.end()
    }
  })

  it.effect("adds org members as developer and promotes them to pm", () =>
    Effect.gen(function* () {
      yield* run((projects) =>
        projects.addMember(orgSlug, pm, slug, {
          email: `${developer}@example.test`,
          role: "developer"
        })
      )
      yield* run((projects) =>
        projects.addMember(orgSlug, pm, slug, {
          email: `${second}@example.test`,
          role: "developer"
        })
      )
      yield* run((projects) =>
        projects.updateMember(orgSlug, pm, slug, second, "pm")
      )
      expect(yield* roles()).toStrictEqual({
        [pm]: "pm",
        [second]: "pm",
        [developer]: "developer"
      })
    })
  )

  it.effect("keeps developers out of member management", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        run((projects) =>
          projects.updateMember(orgSlug, developer, slug, second, "developer")
        )
      )
      expect(error._tag).toBe("Forbidden")
    })
  )

  it.effect("lets a pm step down while another pm remains", () =>
    Effect.gen(function* () {
      yield* run((projects) =>
        projects.updateMember(orgSlug, second, slug, pm, "developer")
      )
      yield* run((projects) =>
        projects.updateMember(orgSlug, second, slug, pm, "pm")
      )
      yield* run((projects) => projects.removeMember(orgSlug, pm, slug, second))
      expect((yield* roles())[pm]).toBe("pm")
    })
  )

  it.effect("never demotes or removes the last pm", () =>
    Effect.gen(function* () {
      const demote = yield* Effect.flip(
        run((projects) =>
          projects.updateMember(orgSlug, pm, slug, pm, "developer")
        )
      )
      const remove = yield* Effect.flip(
        run((projects) => projects.removeMember(orgSlug, pm, slug, pm))
      )
      expect(demote).toMatchObject({
        _tag: "LastProjectPmBlocked",
        projectSlugs: [slug]
      })
      expect(remove).toMatchObject({ _tag: "LastProjectPmBlocked" })
    })
  )

  it.effect("ends project access when the org membership goes", () =>
    Effect.gen(function* () {
      yield* run((projects) => projects.requireMember(orgSlug, developer, slug))
      yield* Effect.promise(() =>
        pool.query(
          "DELETE FROM member WHERE organization_id=$1 AND user_id=$2",
          [organizationId, developer]
        )
      )
      const error = yield* Effect.flip(
        run((projects) => projects.requireMember(orgSlug, developer, slug))
      )
      expect(error._tag).toBe("NotFound")
    })
  )
})
