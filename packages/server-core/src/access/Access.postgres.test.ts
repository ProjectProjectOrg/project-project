import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { Project } from "@pp/access/roles"
import { DbLive, migrationsFolder } from "@pp/db"
import { CurrentUser, User } from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { Access } from "./Access"
import { AccessLive } from "./AccessLive"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const decodeUser = Schema.decodeSync(User)

const userFor = (id: string) =>
  decodeUser({
    id,
    email: `${id}@example.test`,
    name: id,
    username: null,
    image: null,
    createdAt: "2026-09-24T00:00:00Z",
    activeOrgSlug: null,
    personalGithub: { connected: false },
    editorPreference: "github",
    personalEverhour: {
      connected: false,
      everhourUserId: null,
      name: null,
      email: null,
      lastVerifiedAt: null,
      lastCheckError: null
    }
  })

describe.skipIf(!databaseUrl)("Access", () => {
  const suffix = randomUUID().slice(0, 8)
  const orgSlug = `access-${suffix}`
  const otherOrgSlug = `other-${suffix}`
  const deletedOrgSlug = `deleted-${suffix}`
  const people = {
    owner: `owner-${suffix}`,
    admin: `admin-${suffix}`,
    developer: `developer-${suffix}`,
    bystander: `bystander-${suffix}`,
    client: `client-${suffix}`,
    leaver: `leaver-${suffix}`,
    stranger: `stranger-${suffix}`
  }
  const website = randomUUID()
  const otherWebsite = randomUUID()
  const deletedWebsite = randomUUID()
  let pool: Pool
  let layer: Layer.Layer<Access>

  const as = (userId: string) =>
    Effect.provideService(CurrentUser, userFor(userId))

  const project = (userId: string, org = orgSlug) =>
    Effect.flatMap(Access, (access) => access.project(org, "website")).pipe(
      as(userId),
      Effect.provide(layer)
    )

  const org = (userId: string, slug = orgSlug, includeDeleted = false) =>
    Effect.flatMap(Access, (access) =>
      access.org(slug, { includeDeleted })
    ).pipe(as(userId), Effect.provide(layer))

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
    for (const id of Object.values(people)) {
      await pool.query(
        'INSERT INTO "user" (id, name, email, created_at, updated_at) VALUES ($1, $1, $2, now(), now())',
        [id, `${id}@example.test`]
      )
    }
    await pool.query(
      "INSERT INTO organization (id, name, slug, created_at, deleted_at) VALUES ($1, $1, $1, now(), NULL), ($2, $2, $2, now(), NULL), ($3, $3, $3, now(), now())",
      [orgSlug, otherOrgSlug, deletedOrgSlug]
    )
    const members: ReadonlyArray<readonly [string, string, string]> = [
      [orgSlug, people.owner, "owner"],
      [orgSlug, people.admin, "admin"],
      [orgSlug, people.developer, "member"],
      [orgSlug, people.bystander, "member"],
      [orgSlug, people.client, "guest"],
      [orgSlug, people.leaver, "member"],
      [otherOrgSlug, people.stranger, "owner"],
      [deletedOrgSlug, people.owner, "owner"]
    ]
    for (const [organizationId, userId, role] of members) {
      await pool.query(
        "INSERT INTO member (id, organization_id, user_id, role, created_at) VALUES ($1, $2, $3, $4, now())",
        [randomUUID(), organizationId, userId, role]
      )
    }
    for (const [id, organizationId] of [
      [website, orgSlug],
      [otherWebsite, otherOrgSlug],
      [deletedWebsite, deletedOrgSlug]
    ]) {
      await pool.query(
        "INSERT INTO project_index (id, slug, organization_id, key, name, icon, color, created_by) VALUES ($1, 'website', $2, 'WEB', 'Website', 'x', '#000000', 'seed')",
        [id, organizationId]
      )
    }
    const roles: ReadonlyArray<readonly [string, string, string, string]> = [
      [website, orgSlug, people.owner, "pm"],
      [website, orgSlug, people.developer, "developer"],
      [website, orgSlug, people.client, "client"],
      [website, orgSlug, people.leaver, "developer"],
      [deletedWebsite, deletedOrgSlug, people.owner, "pm"]
    ]
    for (const [projectId, organizationId, userId, roleId] of roles) {
      await pool.query(
        "INSERT INTO project_member (project_id, organization_id, user_id, role_id) VALUES ($1, $2, $3, $4)",
        [projectId, organizationId, userId, roleId]
      )
    }
    layer = AccessLive.pipe(
      Layer.provide(DbLive),
      Layer.provide(
        PgClient.layer({ url: Redacted.make(databaseUrl), maxConnections: 1 })
      ),
      Layer.orDie
    )
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id = ANY($1)", [
        [orgSlug, otherOrgSlug, deletedOrgSlug]
      ])
      await pool.query('DELETE FROM "user" WHERE id = ANY($1)', [
        Object.values(people)
      ])
      await pool.end()
    }
  })

  it.effect("resolves the org role and its permissions", () =>
    Effect.gen(function* () {
      const scope = yield* org(people.admin)
      expect(scope).toMatchObject({
        userId: people.admin,
        organizationId: orgSlug,
        orgSlug,
        role: "admin",
        deletedAt: null
      })
      expect(scope.permissions.can({ integration: ["manage"] })).toBe(true)
      expect(scope.permissions.can({ organization: ["delete"] })).toBe(false)
    })
  )

  it.effect("hides an org from someone outside it", () =>
    Effect.gen(function* () {
      expect((yield* Effect.flip(org(people.stranger)))._tag).toBe("NotFound")
    })
  )

  it.effect("hides a soft-deleted org unless the caller asks for it", () =>
    Effect.gen(function* () {
      expect((yield* Effect.flip(org(people.owner, deletedOrgSlug)))._tag).toBe(
        "NotFound"
      )
      const restorable = yield* org(people.owner, deletedOrgSlug, true)
      expect(restorable.deletedAt).toBeInstanceOf(Date)
      expect(
        (yield* Effect.flip(project(people.owner, deletedOrgSlug)))._tag
      ).toBe("NotFound")
    })
  )

  it.effect("gives a project member their role's permissions", () =>
    Effect.gen(function* () {
      const developer = yield* project(people.developer)
      expect(developer).toMatchObject({
        projectId: website,
        organizationId: orgSlug,
        slug: "website",
        orgRole: "member",
        role: "developer"
      })
      expect(developer.permissions.grants).toStrictEqual(
        Project.developer.grants
      )
      const client = yield* project(people.client)
      expect([client.orgRole, client.role]).toStrictEqual(["guest", "client"])
      expect(client.permissions.can({ github: ["read"] })).toBe(false)
    })
  )

  it.effect(
    "gives an org admin without a project role read-only content and member administration",
    () =>
      Effect.gen(function* () {
        const admin = yield* project(people.admin)
        expect(admin.role).toBeNull()
        expect(
          admin.permissions.can({
            ticket: ["read"],
            docs: ["read"],
            members: ["manage"]
          })
        ).toBe(true)
        expect(
          admin.permissions.can(
            { ticket: ["create", "update"], comment: ["create"] },
            "OR"
          )
        ).toBe(false)
      })
  )

  it.effect("adds the org owner's extras to their PM role", () =>
    Effect.gen(function* () {
      const owner = yield* project(people.owner)
      expect(owner.role).toBe("pm")
      expect(owner.permissions.grants).toStrictEqual(
        Project.projectStatement.all
      )
    })
  )

  it.effect("hides a project from org members without a project role", () =>
    Effect.gen(function* () {
      expect((yield* Effect.flip(project(people.bystander)))._tag).toBe(
        "NotFound"
      )
    })
  )

  it.effect("resolves the project in the caller's org, not another org's", () =>
    Effect.gen(function* () {
      expect((yield* Effect.flip(project(people.stranger)))._tag).toBe(
        "NotFound"
      )
      const stranger = yield* project(people.stranger, otherOrgSlug)
      expect(stranger.projectId).toBe(otherWebsite)
    })
  )

  it.effect("ends project access as soon as someone leaves the org", () =>
    Effect.gen(function* () {
      expect((yield* project(people.leaver)).role).toBe("developer")
      yield* Effect.promise(() =>
        pool.query(
          "DELETE FROM member WHERE organization_id = $1 AND user_id = $2",
          [orgSlug, people.leaver]
        )
      )
      expect((yield* Effect.flip(project(people.leaver)))._tag).toBe("NotFound")
      expect((yield* Effect.flip(org(people.leaver)))._tag).toBe("NotFound")
    })
  )
})
