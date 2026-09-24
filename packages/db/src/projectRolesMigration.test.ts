import * as BunServices from "@effect/platform-bun/BunServices"
import { layer } from "@effect/vitest"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { describe, expect } from "vitest"

import { migrationsFolder } from "./migrations"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const projectRolesMigration = "20260924125714_project_roles"

const fixture = `
INSERT INTO "user" (id, name, email) VALUES
  ('owner', 'Owner', 'owner@example.test'),
  ('admin', 'Admin', 'admin@example.test'),
  ('dev', 'Dev', 'dev@example.test'),
  ('comma', 'Comma', 'comma@example.test'),
  ('dup', 'Dup', 'dup@example.test'),
  ('left', 'Left', 'left@example.test');
INSERT INTO "organization" (id, name, slug, created_at) VALUES
  ('o1', 'IGNE', 'igne', now()),
  ('o2', 'Other', 'other', now());
INSERT INTO "member" (id, organization_id, user_id, role, created_at) VALUES
  ('m1', 'o1', 'owner', 'owner', now()),
  ('m2', 'o1', 'admin', 'admin', now()),
  ('m3', 'o1', 'dev', 'member', now()),
  ('m4', 'o1', 'comma', 'member,admin', now()),
  ('m5', 'o1', 'dup', 'member', now() - interval '2 days'),
  ('m6', 'o1', 'dup', 'admin', now()),
  ('m7', 'o2', 'dev', 'member', now());
INSERT INTO "project_index" (slug, organization_id, key, name, icon, color, created_by) VALUES
  ('web', 'o1', 'WEB', 'Web', 'x', '#000000', 'owner'),
  ('app', 'o1', 'APP', 'App', 'x', '#000000', 'admin'),
  ('ext', 'o2', 'EXT', 'Ext', 'x', '#000000', 'dev');
INSERT INTO "project_member" (project_slug, user_id, role) VALUES
  ('web', 'owner', 'owner'),
  ('web', 'dev', 'member'),
  ('web', 'left', 'admin'),
  ('app', 'dev', 'admin'),
  ('app', 'dup', 'member'),
  ('ext', 'dev', 'owner');
INSERT INTO "invitation" (id, organization_id, email, role, status, expires_at, inviter_id) VALUES
  ('i1', 'o1', 'invitee@example.test', 'member', 'pending', now() + interval '7 days', 'admin');
INSERT INTO "project_invite_grant" (invitation_id, project_slug, project_id, role)
  SELECT 'i1', slug, id, CASE slug WHEN 'web' THEN 'admin' ELSE 'member' END
  FROM "project_index" WHERE slug IN ('web', 'app');
`

type Row = Readonly<Record<string, string>>

class QueryFailed extends Schema.TaggedError<QueryFailed>()("QueryFailed", {
  message: Schema.String
}) {}

class MigratedDatabase extends Context.Service<
  MigratedDatabase,
  Readonly<{
    rows: (query: string) => Effect.Effect<ReadonlyArray<Row>>
    execute: (query: string) => Effect.Effect<void, QueryFailed>
  }>
>()("@pp/db/projectRolesMigration.test/MigratedDatabase") {}

const pool = (connectionString: string) =>
  Effect.acquireRelease(
    Effect.sync(() => new Pool({ connectionString })),
    (client) => Effect.promise(() => client.end())
  )

const MigratedDatabaseLive = Layer.effect(
  MigratedDatabase,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const url = new URL(databaseUrl ?? "postgres://invalid")
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      return yield* Effect.die(
        "Migration tests require an isolated local test database"
      )
    }
    const name = `${url.pathname.slice(1)}_roles`
    const admin = yield* pool(url.toString())
    yield* Effect.acquireRelease(
      Effect.promise(async () => {
        await admin.query(`DROP DATABASE IF EXISTS "${name}"`)
        await admin.query(`CREATE DATABASE "${name}"`)
      }),
      () =>
        Effect.promise(() => admin.query(`DROP DATABASE IF EXISTS "${name}"`))
    )
    url.pathname = `/${name}`
    const client = yield* pool(url.toString())

    const before = yield* fs.makeTempDirectoryScoped({
      prefix: "pp-migrations-"
    })
    const migrations = yield* fs.readDirectory(migrationsFolder)
    yield* Effect.forEach(
      migrations.filter((migration) => migration < projectRolesMigration),
      (migration) =>
        fs.copy(
          path.join(migrationsFolder, migration),
          path.join(before, migration)
        ),
      { discard: true }
    )
    yield* Effect.promise(() =>
      migrate(drizzle({ client }), { migrationsFolder: before })
    )
    yield* Effect.promise(() => client.query(fixture))
    yield* Effect.promise(() =>
      migrate(drizzle({ client }), { migrationsFolder })
    )

    return MigratedDatabase.of({
      rows: (query) =>
        Effect.promise(async () => (await client.query<Row>(query)).rows),
      execute: (query) =>
        Effect.tryPromise({
          try: () => client.query(query),
          catch: (cause) => new QueryFailed({ message: String(cause) })
        })
    })
  })
).pipe(Layer.provide(BunServices.layer))

const projectMembers = `
  SELECT p.slug AS project, pm.user_id, pm.role_id
  FROM "project_member" pm
  JOIN "project_index" p ON p.id = pm.project_id
  ORDER BY 1, 2
`

describe.skipIf(!databaseUrl)("project roles migration", () => {
  layer(MigratedDatabaseLive, { timeout: "60 seconds" })((it) => {
    it.effect(
      "folds comma roles and collapses duplicate memberships to the highest role",
      () =>
        Effect.gen(function* () {
          const database = yield* MigratedDatabase
          expect(
            yield* database.rows(
              `SELECT organization_id, user_id, role FROM "member" ORDER BY 1, 2`
            )
          ).toStrictEqual([
            { organization_id: "o1", user_id: "admin", role: "admin" },
            { organization_id: "o1", user_id: "comma", role: "admin" },
            { organization_id: "o1", user_id: "dev", role: "member" },
            { organization_id: "o1", user_id: "dup", role: "admin" },
            { organization_id: "o1", user_id: "owner", role: "owner" },
            { organization_id: "o2", user_id: "dev", role: "member" }
          ])
        })
    )

    it.effect(
      "maps project roles, drops orphans and makes implicit access explicit",
      () =>
        Effect.gen(function* () {
          const database = yield* MigratedDatabase
          expect(yield* database.rows(projectMembers)).toStrictEqual([
            { project: "app", user_id: "admin", role_id: "pm" },
            { project: "app", user_id: "comma", role_id: "pm" },
            { project: "app", user_id: "dev", role_id: "pm" },
            { project: "app", user_id: "dup", role_id: "pm" },
            { project: "app", user_id: "owner", role_id: "pm" },
            { project: "ext", user_id: "dev", role_id: "pm" },
            { project: "web", user_id: "admin", role_id: "pm" },
            { project: "web", user_id: "comma", role_id: "pm" },
            { project: "web", user_id: "dev", role_id: "developer" },
            { project: "web", user_id: "dup", role_id: "pm" },
            { project: "web", user_id: "owner", role_id: "pm" }
          ])
        })
    )

    it.effect("maps invite grants to the new roles", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        expect(
          yield* database.rows(`
            SELECT g.invitation_id, p.slug AS project, g.role_id
            FROM "project_invite_grant" g
            JOIN "project_index" p ON p.id = g.project_id
            ORDER BY 2
          `)
        ).toStrictEqual([
          { invitation_id: "i1", project: "app", role_id: "developer" },
          { invitation_id: "i1", project: "web", role_id: "pm" }
        ])
      })
    )

    it.effect("keeps the old rows in legacy tables", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        expect(
          yield* database.rows(
            `SELECT count(*)::text AS count FROM "legacy_project_member"`
          )
        ).toStrictEqual([{ count: "6" }])
      })
    )

    it.effect("rejects a comma-separated org role", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        const error = yield* Effect.flip(
          database.execute(
            `INSERT INTO "member" (id, organization_id, user_id, role, created_at) VALUES ('m8', 'o2', 'owner', 'admin,member', now())`
          )
        )
        expect(error.message).toContain("member_role_check")
      })
    )

    it.effect("removes project memberships when the org membership goes", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        yield* database.execute(
          `DELETE FROM "member" WHERE organization_id = 'o1' AND user_id = 'dev'`
        )
        expect(
          yield* database.rows(
            `SELECT p.slug AS project FROM "project_member" pm JOIN "project_index" p ON p.id = pm.project_id WHERE pm.user_id = 'dev'`
          )
        ).toStrictEqual([{ project: "ext" }])
      })
    )
  })
})
