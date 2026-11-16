import * as Effect from "effect/Effect"
import * as Migrator from "effect/sql/Migrator"
import * as SqlClient from "effect/sql/SqlClient"

export const FACT_TABLES = [
  "local_tickets",
  "local_groups",
  "local_statuses",
  "local_tags",
  "local_members"
] as const

export type FactTable = (typeof FACT_TABLES)[number]

const createFacts = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const table of FACT_TABLES)
    yield* sql`create table ${sql(table)} (
      scope text not null,
      id text not null,
      data text not null,
      primary key (scope, id)
    )`
  yield* sql`create table local_projects (scope text primary key, data text not null)`
  yield* sql`create table local_sync (scope text primary key, cursor text not null)`
})

export const localMigrations = Migrator.fromRecord({
  "0001_facts": createFacts
})
