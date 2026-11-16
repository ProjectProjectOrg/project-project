import {
  GroupFact,
  MemberFact,
  ProjectFact,
  type ProjectSync,
  StatusFact,
  type SyncCursor,
  TagFact,
  TicketFact
} from "@pp/shared"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"

import { FACT_TABLES, type FactTable } from "./localSchema"

const INSERT_CHUNK = 500

const json = <S extends Schema.Top & { readonly EncodingServices: never }>(
  schema: S
) => Schema.encodeSync(Schema.fromJsonString(schema))

const ticketJson = json(TicketFact)
const groupJson = json(GroupFact)
const statusJson = json(StatusFact)
const tagJson = json(TagFact)
const memberJson = json(MemberFact)
const projectJson = json(ProjectFact)

type FactRow = Readonly<{ id: string; data: string }>

type Facts = Readonly<Record<FactTable, ReadonlyArray<FactRow>>>

type Deletes = Readonly<Record<FactTable, ReadonlyArray<string>>>

const rowsOf = (facts: {
  readonly tickets: ReadonlyArray<TicketFact>
  readonly groups: ReadonlyArray<GroupFact>
  readonly statuses: ReadonlyArray<StatusFact>
  readonly tags: ReadonlyArray<TagFact>
  readonly members: ReadonlyArray<MemberFact>
}): Facts => ({
  local_tickets: facts.tickets.map((fact) => ({
    id: fact.id,
    data: ticketJson(fact)
  })),
  local_groups: facts.groups.map((fact) => ({
    id: fact.id,
    data: groupJson(fact)
  })),
  local_statuses: facts.statuses.map((fact) => ({
    id: fact.slug,
    data: statusJson(fact)
  })),
  local_tags: facts.tags.map((fact) => ({
    id: fact.name,
    data: tagJson(fact)
  })),
  local_members: facts.members.map((fact) => ({
    id: fact.userId,
    data: memberJson(fact)
  }))
})

export type LocalFacts = Readonly<{
  cursor: SyncCursor | null
  project: string | null
  facts: Facts
}>

export const snapshotFacts = (
  snapshot: Extract<ProjectSync, { kind: "snapshot" }>
): LocalFacts => ({
  cursor: snapshot.cursor,
  project: projectJson(snapshot.project),
  facts: rowsOf(snapshot)
})

export type Applied = "applied" | "stale"

export const cursorOf = (scope: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{
      cursor: string
    }>`select cursor from local_sync where scope = ${scope}`
    return rows[0]?.cursor ?? null
  })

const upsert = (
  scope: string,
  table: FactTable,
  rows: ReadonlyArray<FactRow>
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    for (const chunk of Arr.chunksOf(rows, INSERT_CHUNK))
      yield* sql`insert into ${sql(table)} ${sql.insert(
        chunk.map((row) => ({ scope, id: row.id, data: row.data }))
      )} on conflict (scope, id) do update set data = excluded.data`
  })

const remove = (scope: string, table: FactTable, ids: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    if (ids.length > 0)
      yield* sql`delete from ${sql(table)} where scope = ${scope} and ${sql.in(
        "id",
        ids
      )}`
  })

const clear = (scope: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    for (const table of FACT_TABLES)
      yield* sql`delete from ${sql(table)} where scope = ${scope}`
    yield* sql`delete from local_projects where scope = ${scope}`
  })

const setProject = (scope: string, data: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`insert into local_projects (scope, data) values (${scope}, ${data})
      on conflict (scope) do update set data = excluded.data`
  })

const setCursor = (scope: string, cursor: SyncCursor) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`insert into local_sync (scope, cursor) values (${scope}, ${cursor})
      on conflict (scope) do update set cursor = excluded.cursor`
  })

const deletesOf = (
  sync: Extract<ProjectSync, { kind: "changes" }>
): Deletes => ({
  local_tickets: sync.deletes.tickets,
  local_groups: sync.deletes.groups,
  local_statuses: sync.deletes.statuses,
  local_tags: sync.deletes.tags,
  local_members: sync.deletes.members
})

export const applySync = (
  scope: string,
  base: SyncCursor | null,
  sync: ProjectSync
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        if ((yield* cursorOf(scope)) !== base) return "stale" satisfies Applied
        if (sync.kind === "snapshot") {
          const { project, facts } = snapshotFacts(sync)
          yield* clear(scope)
          if (project !== null) yield* setProject(scope, project)
          for (const table of FACT_TABLES)
            yield* upsert(scope, table, facts[table])
        } else {
          const upserts = rowsOf(sync.upserts)
          const deletes = deletesOf(sync)
          if (sync.project !== null)
            yield* setProject(scope, projectJson(sync.project))
          for (const table of FACT_TABLES) {
            yield* remove(scope, table, deletes[table])
            yield* upsert(scope, table, upserts[table])
          }
        }
        yield* setCursor(scope, sync.cursor)
        return "applied" satisfies Applied
      })
    )
  })

export const purge = (scope: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql.withTransaction(
      Effect.gen(function* () {
        yield* clear(scope)
        yield* sql`delete from local_sync where scope = ${scope}`
      })
    )
  })

export const readFacts = (scope: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const read = (table: FactTable) =>
      sql<FactRow>`select id, data from ${sql(table)} where scope = ${scope} order by id`
    const [project] = yield* sql<{
      data: string
    }>`select data from local_projects where scope = ${scope}`
    const facts: Record<FactTable, ReadonlyArray<FactRow>> = {
      local_tickets: yield* read("local_tickets"),
      local_groups: yield* read("local_groups"),
      local_statuses: yield* read("local_statuses"),
      local_tags: yield* read("local_tags"),
      local_members: yield* read("local_members")
    }
    return {
      cursor: yield* cursorOf(scope),
      project: project?.data ?? null,
      facts
    } satisfies LocalFacts
  })

export const differences = (local: LocalFacts, server: LocalFacts) =>
  FACT_TABLES.flatMap((table) => {
    const mine = new Map(local.facts[table].map((row) => [row.id, row.data]))
    const theirs = new Map(server.facts[table].map((row) => [row.id, row.data]))
    const ids = new Set([...mine.keys(), ...theirs.keys()])
    return [...ids].flatMap((id) =>
      mine.get(id) === theirs.get(id) ? [] : [`${table}/${id}`]
    )
  }).concat(local.project === server.project ? [] : ["local_projects"])
