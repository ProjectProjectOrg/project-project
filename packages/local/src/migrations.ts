import * as Effect from "effect/Effect"
import * as Migrator from "effect/sql/Migrator"
import * as SqlClient from "effect/sql/SqlClient"

import { type LocalSortKey, SORT_KEYS } from "./tables"

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

const orderColumn = (key: LocalSortKey) => `order_${key}`

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

const LEGACY_TABLES = [
  ...FACT_TABLES,
  "local_projects",
  "local_sync",
  "local_ticket_assignees",
  "local_ticket_tags",
  "local_relations",
  "local_group_members"
] as const

const copies = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  for (const table of LEGACY_TABLES) yield* sql`drop table ${sql(table)}`
  yield* sql`create table local_copies (
    id integer primary key autoincrement, scope text not null)`
  yield* sql`create table local_sync (
    scope text primary key, copy integer not null, cursor text not null)`
  yield* sql`create table local_projects (copy integer primary key, data text not null)`
  for (const table of [
    "local_groups",
    "local_statuses",
    "local_tags",
    "local_members"
  ])
    yield* sql`create table ${sql(table)} (
      copy integer not null, id text not null, data text not null,
      primary key (copy, id)) without rowid`
  yield* sql.unsafe(`create table local_tickets (
    copy integer not null,
    id text not null,
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
    primary key (copy, id)
  ) without rowid`)
  for (const key of SORT_KEYS)
    yield* sql.unsafe(
      `create index local_tickets_${key} on local_tickets (copy, archived, status, ${orderColumn(key)})`
    )
  yield* sql`create index local_tickets_parent on local_tickets (copy, parent, archived, status)`
  yield* sql`create table local_ticket_data (
    copy integer not null, id text not null, data text not null,
    primary key (copy, id))`
  yield* sql`create table local_ticket_assignees (
    copy integer not null, ticket text not null, user_id text not null,
    primary key (copy, ticket, user_id)) without rowid`
  yield* sql`create index local_ticket_assignees_user on local_ticket_assignees (copy, user_id)`
  yield* sql`create table local_ticket_tags (
    copy integer not null, ticket text not null, tag text not null,
    primary key (copy, ticket, tag)) without rowid`
  yield* sql`create index local_ticket_tags_tag on local_ticket_tags (copy, tag)`
  yield* sql`create table local_relations (
    copy integer not null, from_id text not null, to_id text not null, kind text not null,
    primary key (copy, from_id, to_id, kind)) without rowid`
  yield* sql`create index local_relations_to on local_relations (copy, to_id, kind)`
  yield* sql`create table local_group_members (
    copy integer not null, group_id text not null, ticket text not null, position integer not null,
    primary key (copy, group_id, ticket)) without rowid`
  yield* sql`create index local_group_members_ticket on local_group_members (copy, ticket)`
})

const staging = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`alter table local_sync add column git integer not null default 0`
  yield* sql`create table local_staging (
    scope text primary key, copy integer not null, base text not null,
    next text, git integer not null)`
})

const pending = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`create table local_pending_ops (
    seq integer primary key autoincrement, id text not null unique,
    scope text not null, tickets text not null, edits text not null,
    write text not null, receipt text)`
  yield* sql`create index local_pending_ops_scope on local_pending_ops (scope, seq)`
  yield* sql`create table local_pending_base (
    copy integer not null, id text not null, data text not null, groups text not null,
    primary key (copy, id))`
})

const descriptions = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`create table local_descriptions (
    scope text not null, id text not null, body text not null,
    revision text not null, missing text not null, used integer not null,
    primary key (scope, id))`
  yield* sql`create index local_descriptions_used on local_descriptions (used)`
  yield* sql`create table local_description_edits (
    scope text not null, id text not null, body text not null,
    base_body text not null, base_revision text not null,
    operation text, sent text, conflict_body text, conflict_revision text,
    failed text,
    primary key (scope, id))`
  yield* sql`create table local_ticket_cache (
    scope text not null, ticket text not null, kind text not null,
    data text not null, used integer not null,
    primary key (scope, ticket, kind))`
  yield* sql`create index local_ticket_cache_used on local_ticket_cache (used)`
})

export const localMigrations = Migrator.fromRecord({
  "0001_facts": createFacts,
  "0002_ticket_columns": ticketColumns,
  "0003_copies": copies,
  "0004_staging": staging,
  "0005_pending": pending,
  "0006_descriptions": descriptions
})
