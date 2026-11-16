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

export const SORT_KEYS = [
  "manual",
  "id",
  "created",
  "updated",
  "title",
  "priority",
  "estimate"
] as const

export type LocalSortKey = (typeof SORT_KEYS)[number]

export const orderColumn = (key: LocalSortKey) => `order_${key}`

const ORDER_SEPARATOR = "\u0000"
const STORED_SEPARATOR = "\u0001"

export const storedOrderKey = (key: string) =>
  key.replace(ORDER_SEPARATOR, STORED_SEPARATOR)

export const readOrderKey = (stored: string) =>
  stored.replace(STORED_SEPARATOR, ORDER_SEPARATOR)

const ticketColumns = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const table of [...FACT_TABLES, "local_projects", "local_sync"])
    yield* sql`delete from ${sql(table)}`
  yield* sql`drop table local_tickets`
  yield* sql.unsafe(`create table local_tickets (
    scope text not null,
    id text not null,
    data text not null,
    title text not null,
    status text not null,
    type text,
    parent text,
    archived integer not null,
    flagged integer not null,
    has_branch integer not null,
    has_pr integer not null,
    estimate_unit text,
    estimate_size text,
    updated_at text not null,
    ${SORT_KEYS.map((key) => `${orderColumn(key)} text not null`).join(",\n    ")},
    primary key (scope, id)
  )`)
  for (const key of SORT_KEYS)
    yield* sql.unsafe(
      `create index local_tickets_${key} on local_tickets (scope, archived, status, ${orderColumn(key)})`
    )
  yield* sql`create index local_tickets_parent on local_tickets (scope, parent)`
  yield* sql`create table local_ticket_assignees (
    scope text not null, ticket text not null, user_id text not null,
    primary key (scope, ticket, user_id))`
  yield* sql`create index local_ticket_assignees_user on local_ticket_assignees (scope, user_id)`
  yield* sql`create table local_ticket_tags (
    scope text not null, ticket text not null, tag text not null,
    primary key (scope, ticket, tag))`
  yield* sql`create index local_ticket_tags_tag on local_ticket_tags (scope, tag)`
  yield* sql`create table local_relations (
    scope text not null, from_id text not null, to_id text not null, kind text not null,
    primary key (scope, from_id, to_id, kind))`
  yield* sql`create index local_relations_to on local_relations (scope, to_id, kind)`
  yield* sql`create table local_group_members (
    scope text not null, group_id text not null, ticket text not null, position integer not null,
    primary key (scope, group_id, ticket))`
  yield* sql`create index local_group_members_ticket on local_group_members (scope, ticket)`
})

export const localMigrations = Migrator.fromRecord({
  "0001_facts": createFacts,
  "0002_ticket_columns": ticketColumns
})
