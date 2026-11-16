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
import { and, asc, eq, getTableColumns, inArray, sql } from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"

import { localOrderKey } from "@/features/tickets/lib/ticketRows"

import { LocalDb } from "./localDatabase"
import { storedOrderKey } from "./localSchema"
import {
  localGroupMembers,
  localGroups,
  localMembers,
  localProjects,
  localRelations,
  localStatuses,
  localSync,
  localTags,
  localTicketAssignees,
  localTickets,
  localTicketTags,
  type LocalSortKey
} from "./localTables"

const CHUNK = 500

const json = <S extends Schema.Top & { readonly EncodingServices: never }>(
  schema: S
) => Schema.encodeSync(Schema.fromJsonString(schema))

const ticketJson = json(TicketFact)
const groupJson = json(GroupFact)
const statusJson = json(StatusFact)
const tagJson = json(TagFact)
const memberJson = json(MemberFact)
const projectJson = json(ProjectFact)

const JSON_TABLES = {
  groups: localGroups,
  statuses: localStatuses,
  tags: localTags,
  members: localMembers
} as const

type JsonKind = keyof typeof JSON_TABLES
type FactKind = "tickets" | JsonKind

const JSON_KINDS: ReadonlyArray<JsonKind> = [
  "groups",
  "statuses",
  "tags",
  "members"
]
const KINDS: ReadonlyArray<FactKind> = ["tickets", ...JSON_KINDS]

type FactRow = Readonly<{ id: string; data: string }>

type Facts = Readonly<Record<FactKind, ReadonlyArray<FactRow>>>

type FactSet = Readonly<{
  tickets: ReadonlyArray<TicketFact>
  groups: ReadonlyArray<GroupFact>
  statuses: ReadonlyArray<StatusFact>
  tags: ReadonlyArray<TagFact>
  members: ReadonlyArray<MemberFact>
}>

const rowsOf = (facts: FactSet): Facts => ({
  tickets: facts.tickets.map((f) => ({ id: f.id, data: ticketJson(f) })),
  groups: facts.groups.map((f) => ({ id: f.id, data: groupJson(f) })),
  statuses: facts.statuses.map((f) => ({ id: f.slug, data: statusJson(f) })),
  tags: facts.tags.map((f) => ({ id: f.name, data: tagJson(f) })),
  members: facts.members.map((f) => ({ id: f.userId, data: memberJson(f) }))
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
    const db = yield* LocalDb
    const [row] = yield* db
      .select({ cursor: localSync.cursor })
      .from(localSync)
      .where(eq(localSync.scope, scope))
    return row?.cursor ?? null
  })

const orderKey = (fact: TicketFact, key: LocalSortKey) =>
  storedOrderKey(localOrderKey(fact, { key, dir: "asc" }))

const ticketRow = (
  scope: string,
  fact: TicketFact
): typeof localTickets.$inferInsert => ({
  scope,
  id: fact.id,
  data: ticketJson(fact),
  title: fact.title,
  status: fact.status,
  type: fact.type,
  parent: fact.parent,
  archived: fact.archivedAt === null ? 0 : 1,
  flagged: fact.flag === null ? 0 : 1,
  hasBranch: fact.git?.branch == null ? 0 : 1,
  hasPr: fact.git?.pr == null ? 0 : 1,
  estimateUnit: fact.estimate?.unit ?? null,
  estimateSize: fact.estimate?.unit === "tshirt" ? fact.estimate.value : null,
  updatedAt: fact.updatedAt.toISOString(),
  orderManual: orderKey(fact, "manual"),
  orderId: orderKey(fact, "id"),
  orderCreated: orderKey(fact, "created"),
  orderUpdated: orderKey(fact, "updated"),
  orderTitle: orderKey(fact, "title"),
  orderPriority: orderKey(fact, "priority"),
  orderEstimate: orderKey(fact, "estimate")
})

const excludedTicket = Object.fromEntries(
  Object.entries(getTableColumns(localTickets))
    .filter(([key]) => key !== "scope" && key !== "id")
    .map(([key, column]) => [key, sql.raw(`excluded.${column.name}`)])
)

const chunked = <A, E, R>(
  rows: ReadonlyArray<A>,
  write: (chunk: Array<A>) => Effect.Effect<unknown, E, R>
) =>
  Effect.forEach(Arr.chunksOf(rows, CHUNK), (chunk) => write([...chunk]), {
    discard: true
  })

const writeTickets = (
  scope: string,
  facts: ReadonlyArray<TicketFact>,
  fresh: boolean
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    if (!fresh)
      yield* removeTicketEdges(
        scope,
        facts.map((fact) => fact.id)
      )
    yield* chunked(
      facts.map((fact) => ticketRow(scope, fact)),
      (rows) =>
        db
          .insert(localTickets)
          .values(rows)
          .onConflictDoUpdate({
            target: [localTickets.scope, localTickets.id],
            set: excludedTicket
          })
    )
    yield* chunked(
      facts.flatMap((fact) =>
        fact.assignees.map((userId) => ({ scope, ticket: fact.id, userId }))
      ),
      (rows) =>
        db.insert(localTicketAssignees).values(rows).onConflictDoNothing()
    )
    yield* chunked(
      facts.flatMap((fact) =>
        fact.tags.map((tag) => ({ scope, ticket: fact.id, tag }))
      ),
      (rows) => db.insert(localTicketTags).values(rows).onConflictDoNothing()
    )
    yield* chunked(
      facts.flatMap((fact) =>
        fact.relations.map((relation) => ({
          scope,
          fromId: fact.id,
          toId: relation.to,
          kind: relation.kind
        }))
      ),
      (rows) => db.insert(localRelations).values(rows).onConflictDoNothing()
    )
  })

const removeTicketEdges = (scope: string, ids: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    yield* chunked(ids, (chunk) =>
      Effect.all([
        db
          .delete(localTicketAssignees)
          .where(
            and(
              eq(localTicketAssignees.scope, scope),
              inArray(localTicketAssignees.ticket, chunk)
            )
          ),
        db
          .delete(localTicketTags)
          .where(
            and(
              eq(localTicketTags.scope, scope),
              inArray(localTicketTags.ticket, chunk)
            )
          ),
        db
          .delete(localRelations)
          .where(
            and(
              eq(localRelations.scope, scope),
              inArray(localRelations.fromId, chunk)
            )
          )
      ])
    )
  })

const writeGroupMembers = (
  scope: string,
  groups: ReadonlyArray<GroupFact>,
  fresh: boolean
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    if (!fresh)
      yield* removeGroupMembers(
        scope,
        groups.map((group) => group.id)
      )
    yield* chunked(
      groups.flatMap((group) =>
        group.tickets.map((ticket, position) => ({
          scope,
          groupId: group.id,
          ticket,
          position
        }))
      ),
      (rows) => db.insert(localGroupMembers).values(rows).onConflictDoNothing()
    )
  })

const removeGroupMembers = (scope: string, ids: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    yield* chunked(ids, (chunk) =>
      db
        .delete(localGroupMembers)
        .where(
          and(
            eq(localGroupMembers.scope, scope),
            inArray(localGroupMembers.groupId, chunk)
          )
        )
    )
  })

const writeJson = (
  scope: string,
  kind: JsonKind,
  rows: ReadonlyArray<FactRow>
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const table = JSON_TABLES[kind]
    yield* chunked(
      rows.map((row) => ({ scope, id: row.id, data: row.data })),
      (chunk) =>
        db
          .insert(table)
          .values(chunk)
          .onConflictDoUpdate({
            target: [table.scope, table.id],
            set: { data: sql.raw("excluded.data") }
          })
    )
  })

const removeFacts = (
  scope: string,
  kind: FactKind,
  ids: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const table = kind === "tickets" ? localTickets : JSON_TABLES[kind]
    yield* chunked(ids, (chunk) =>
      db
        .delete(table)
        .where(and(eq(table.scope, scope), inArray(table.id, chunk)))
    )
    if (kind === "tickets") yield* removeTicketEdges(scope, ids)
    if (kind === "groups") yield* removeGroupMembers(scope, ids)
  })

const clear = (scope: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    for (const table of [
      localTickets,
      ...Object.values(JSON_TABLES),
      localTicketAssignees,
      localTicketTags,
      localRelations,
      localGroupMembers
    ])
      yield* db.delete(table).where(eq(table.scope, scope))
    yield* db.delete(localProjects).where(eq(localProjects.scope, scope))
  })

const setProject = (scope: string, data: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    yield* db
      .insert(localProjects)
      .values({ scope, data })
      .onConflictDoUpdate({ target: localProjects.scope, set: { data } })
  })

const setCursor = (scope: string, cursor: SyncCursor) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    yield* db
      .insert(localSync)
      .values({ scope, cursor })
      .onConflictDoUpdate({ target: localSync.scope, set: { cursor } })
  })

export const applySync = (
  scope: string,
  base: SyncCursor | null,
  sync: ProjectSync
) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient.SqlClient
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        if ((yield* cursorOf(scope)) !== base) return "stale" satisfies Applied
        if (sync.kind === "snapshot") {
          const { project, facts } = snapshotFacts(sync)
          yield* clear(scope)
          if (project !== null) yield* setProject(scope, project)
          yield* writeTickets(scope, sync.tickets, true)
          yield* writeGroupMembers(scope, sync.groups, true)
          for (const kind of JSON_KINDS)
            yield* writeJson(scope, kind, facts[kind])
        } else {
          const upserts = rowsOf(sync.upserts)
          if (sync.project !== null)
            yield* setProject(scope, projectJson(sync.project))
          for (const kind of KINDS)
            yield* removeFacts(scope, kind, sync.deletes[kind])
          yield* writeTickets(scope, sync.upserts.tickets, false)
          yield* writeGroupMembers(scope, sync.upserts.groups, false)
          for (const kind of JSON_KINDS)
            yield* writeJson(scope, kind, upserts[kind])
        }
        yield* setCursor(scope, sync.cursor)
        return "applied" satisfies Applied
      })
    )
  })

export const purge = (scope: string) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient.SqlClient
    const db = yield* LocalDb
    yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        yield* clear(scope)
        yield* db.delete(localSync).where(eq(localSync.scope, scope))
      })
    )
  })

export const readFacts = (scope: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const read = (kind: FactKind) => {
      const table = kind === "tickets" ? localTickets : JSON_TABLES[kind]
      return db
        .select({ id: table.id, data: table.data })
        .from(table)
        .where(eq(table.scope, scope))
        .orderBy(asc(table.id))
    }
    const [project] = yield* db
      .select({ data: localProjects.data })
      .from(localProjects)
      .where(eq(localProjects.scope, scope))
    return {
      cursor: yield* cursorOf(scope),
      project: project?.data ?? null,
      facts: {
        tickets: yield* read("tickets"),
        groups: yield* read("groups"),
        statuses: yield* read("statuses"),
        tags: yield* read("tags"),
        members: yield* read("members")
      }
    } satisfies LocalFacts
  })

export const differences = (local: LocalFacts, server: LocalFacts) =>
  KINDS.flatMap((kind) => {
    const mine = new Map(local.facts[kind].map((row) => [row.id, row.data]))
    const theirs = new Map(server.facts[kind].map((row) => [row.id, row.data]))
    const ids = new Set([...mine.keys(), ...theirs.keys()])
    return [...ids].flatMap((id) =>
      mine.get(id) === theirs.get(id) ? [] : [`${kind}/${id}`]
    )
  }).concat(local.project === server.project ? [] : ["project"])
