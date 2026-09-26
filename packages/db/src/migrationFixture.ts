import * as BunServices from "@effect/platform-bun/BunServices"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { Pool } from "pg"

import { migrationsFolder } from "./migrations"

export type Row = Readonly<Record<string, string | null>>

export class QueryFailed extends Schema.TaggedError<QueryFailed>()(
  "QueryFailed",
  { message: Schema.String }
) {}

export class MigratedDatabase extends Context.Service<
  MigratedDatabase,
  Readonly<{
    rows: (query: string) => Effect.Effect<ReadonlyArray<Row>>
    execute: (query: string) => Effect.Effect<void, QueryFailed>
  }>
>()("@pp/db/migrationFixture/MigratedDatabase") {}

const pool = (connectionString: string) =>
  Effect.acquireRelease(
    Effect.sync(() => new Pool({ connectionString })),
    (client) => Effect.promise(() => client.end())
  )

export const migratedDatabase = (
  databaseUrl: string | undefined,
  migration: string,
  fixture: string
) =>
  Layer.effect(
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
      const name = `${url.pathname.slice(1)}_${migration.slice(0, 14)}`
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
        migrations.filter((candidate) => candidate < migration),
        (candidate) =>
          fs.copy(
            path.join(migrationsFolder, candidate),
            path.join(before, candidate)
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
