import * as PgClient from "@effect/sql-pg/PgClient"
import { Db } from "@pp/db"
import { relations } from "@pp/db/schema"
import { makeWithDefaults } from "drizzle-orm/effect-postgres"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import type * as SqlConnection from "effect/sql/SqlConnection"
import type { SqlError } from "effect/sql/SqlError"
import * as Stream from "effect/Stream"

export type Query = Readonly<{
  sql: string
  params: ReadonlyArray<unknown>
}>

export type Rows = ReadonlyArray<ReadonlyArray<unknown>>

export const makeDatabase = Effect.fnUntraced(function* (
  execute: (query: Query) => Effect.Effect<Rows, SqlError>
) {
  const run = (sql: string, params: ReadonlyArray<unknown>) =>
    execute({ sql, params })
  const connection: SqlConnection.Connection = {
    execute: run,
    executeRaw: run,
    executeValues: run,
    executeValuesUnprepared: run,
    executeUnprepared: run,
    executeStream: (sql, params) =>
      Stream.fromEffect(run(sql, params)).pipe(Stream.flattenIterable)
  }
  const client = yield* SqlClient.make({
    acquirer: Effect.succeed(connection),
    compiler: PgClient.makeCompiler(),
    spanAttributes: []
  })
  const json: PgClient.PgClient["json"] = (value) =>
    client`${JSON.stringify(value)}::jsonb`
  const pg: PgClient.PgClient = Object.assign(client, {
    [PgClient.TypeId]: PgClient.TypeId,
    config: {},
    json,
    listen: () => Effect.die(new Error("Unexpected LISTEN")),
    notify: () => Effect.die(new Error("Unexpected NOTIFY"))
  } satisfies Pick<
    PgClient.PgClient,
    PgClient.TypeId | "config" | "json" | "listen" | "notify"
  >)
  const db = yield* makeWithDefaults({ relations }).pipe(
    Effect.provideService(PgClient.PgClient, pg)
  )
  return db
}, Effect.provide(Reactivity.layer))

export const databaseLayer = (
  execute: (query: Query) => Effect.Effect<Rows, SqlError>
) =>
  Layer.unwrap(
    Effect.map(makeDatabase(execute), (db) =>
      Layer.merge(
        Layer.succeed(Db, db),
        Layer.succeed(SqlClient.SqlClient, db.$client)
      )
    )
  )
