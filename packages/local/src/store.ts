import {
  type GroupFact,
  GroupHeader,
  type GroupMemberFact,
  MemberFact,
  ProjectFact,
  type ProjectChanges,
  type ProjectSnapshot,
  type SnapshotPage,
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

import { LocalDb } from "./LocalDb"
import { localOrderKey, storedOrderKey } from "./orderKey"
import {
  localCopies,
  localGroupMembers,
  localGroups,
  localMembers,
  localProjects,
  localRelations,
  localStaging,
  localStatuses,
  localSync,
  localTags,
  localTicketAssignees,
  localTicketData,
  localTickets,
  localTicketTags,
  type LocalSortKey
} from "./tables"

const CHUNK = 500

const json = <S extends Schema.Top & { readonly EncodingServices: never }>(
  schema: S
) => Schema.encodeSync(Schema.fromJsonString(schema))

const ticketJson = json(TicketFact)
const groupJson = json(GroupHeader)
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

const COPY_TABLES = [
  localTickets,
  localTicketData,
  ...Object.values(JSON_TABLES),
  localTicketAssignees,
  localTicketTags,
  localRelations,
  localGroupMembers,
  localProjects
]

type FactRow = Readonly<{ id: string; data: string }>

type Facts = Readonly<Record<FactKind, ReadonlyArray<FactRow>>>

type JsonFacts = Readonly<{
  groups: ReadonlyArray<GroupHeader>
  statuses: ReadonlyArray<StatusFact>
  tags: ReadonlyArray<TagFact>
  members: ReadonlyArray<MemberFact>
}>

const jsonRowsOf = (facts: JsonFacts): Record<JsonKind, Array<FactRow>> => ({
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

export const snapshotFacts = (snapshot: ProjectSnapshot): LocalFacts => ({
  cursor: snapshot.cursor,
  project: projectJson(snapshot.project),
  facts: {
    tickets: snapshot.tickets.map((f) => ({ id: f.id, data: ticketJson(f) })),
    ...jsonRowsOf(snapshot)
  }
})

export type Applied = "applied" | "stale"

const syncRow = (scope: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [row] = yield* db
      .select({
        copy: localSync.copy,
        cursor: localSync.cursor,
        git: localSync.git
      })
      .from(localSync)
      .where(eq(localSync.scope, scope))
    return row ?? null
  })

export const cursorOf = (scope: string) =>
  Effect.map(syncRow(scope), (row) => row?.cursor ?? null)

export const copyOf = (scope: string) =>
  Effect.map(syncRow(scope), (row) => row?.copy ?? null)

const orderKey = (fact: TicketFact, key: LocalSortKey) =>
  storedOrderKey(localOrderKey(fact, { key, dir: "asc" }))

const ticketRow = (
  copy: number,
  fact: TicketFact
): typeof localTickets.$inferInsert => ({
  copy,
  id: fact.id,
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

const excluded = (columns: Readonly<Record<string, { name: string }>>) =>
  Object.fromEntries(
    Object.entries(columns)
      .filter(([key]) => key !== "copy" && key !== "id")
      .map(([key, column]) => [key, sql.raw(`excluded.${column.name}`)])
  )

const excludedTicket = excluded(getTableColumns(localTickets))

const chunked = <A, E, R>(
  rows: ReadonlyArray<A>,
  write: (chunk: Array<A>) => Effect.Effect<unknown, E, R>
) =>
  Effect.forEach(Arr.chunksOf(rows, CHUNK), (chunk) => write([...chunk]), {
    discard: true
  })

const writeTickets = (
  copy: number,
  facts: ReadonlyArray<TicketFact>,
  fresh: boolean
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    if (!fresh)
      yield* removeTicketEdges(
        copy,
        facts.map((fact) => fact.id)
      )
    yield* chunked(
      facts.map((fact) => ticketRow(copy, fact)),
      (rows) =>
        db
          .insert(localTickets)
          .values(rows)
          .onConflictDoUpdate({
            target: [localTickets.copy, localTickets.id],
            set: excludedTicket
          })
    )
    yield* chunked(
      facts.map((fact) => ({ copy, id: fact.id, data: ticketJson(fact) })),
      (rows) =>
        db
          .insert(localTicketData)
          .values(rows)
          .onConflictDoUpdate({
            target: [localTicketData.copy, localTicketData.id],
            set: { data: sql.raw("excluded.data") }
          })
    )
    yield* chunked(
      facts.flatMap((fact) =>
        fact.assignees.map((userId) => ({ copy, ticket: fact.id, userId }))
      ),
      (rows) =>
        db.insert(localTicketAssignees).values(rows).onConflictDoNothing()
    )
    yield* chunked(
      facts.flatMap((fact) =>
        fact.tags.map((tag) => ({ copy, ticket: fact.id, tag }))
      ),
      (rows) => db.insert(localTicketTags).values(rows).onConflictDoNothing()
    )
    yield* chunked(
      facts.flatMap((fact) =>
        fact.relations.map((relation) => ({
          copy,
          fromId: fact.id,
          toId: relation.to,
          kind: relation.kind
        }))
      ),
      (rows) => db.insert(localRelations).values(rows).onConflictDoNothing()
    )
  })

const removeTicketEdges = (copy: number, ids: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    yield* chunked(ids, (chunk) =>
      Effect.all([
        db
          .delete(localTicketAssignees)
          .where(
            and(
              eq(localTicketAssignees.copy, copy),
              inArray(localTicketAssignees.ticket, chunk)
            )
          ),
        db
          .delete(localTicketTags)
          .where(
            and(
              eq(localTicketTags.copy, copy),
              inArray(localTicketTags.ticket, chunk)
            )
          ),
        db
          .delete(localRelations)
          .where(
            and(
              eq(localRelations.copy, copy),
              inArray(localRelations.fromId, chunk)
            )
          )
      ])
    )
  })

const writeMembers = (copy: number, members: ReadonlyArray<GroupMemberFact>) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    yield* chunked(
      members.map((member) => ({
        copy,
        groupId: member.group,
        ticket: member.ticket,
        position: member.position
      })),
      (rows) => db.insert(localGroupMembers).values(rows).onConflictDoNothing()
    )
  })

const membersOf = (groups: ReadonlyArray<GroupFact>) =>
  groups.flatMap((group) =>
    group.tickets.map((ticket, position) => ({
      group: group.id,
      ticket,
      position
    }))
  )

const removeGroupMembers = (copy: number, ids: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    yield* chunked(ids, (chunk) =>
      db
        .delete(localGroupMembers)
        .where(
          and(
            eq(localGroupMembers.copy, copy),
            inArray(localGroupMembers.groupId, chunk)
          )
        )
    )
  })

const writeJson = (
  copy: number,
  kind: JsonKind,
  rows: ReadonlyArray<FactRow>
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const table = JSON_TABLES[kind]
    yield* chunked(
      rows.map((row) => ({ copy, id: row.id, data: row.data })),
      (chunk) =>
        db
          .insert(table)
          .values(chunk)
          .onConflictDoUpdate({
            target: [table.copy, table.id],
            set: { data: sql.raw("excluded.data") }
          })
    )
  })

const removeFacts = (
  copy: number,
  kind: FactKind,
  ids: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const tables =
      kind === "tickets" ? [localTickets, localTicketData] : [JSON_TABLES[kind]]
    for (const table of tables)
      yield* chunked(ids, (chunk) =>
        db
          .delete(table)
          .where(and(eq(table.copy, copy), inArray(table.id, chunk)))
      )
    if (kind === "tickets") yield* removeTicketEdges(copy, ids)
    if (kind === "groups") yield* removeGroupMembers(copy, ids)
  })

const newCopy = (scope: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [row] = yield* db
      .insert(localCopies)
      .values({ scope })
      .returning({ id: localCopies.id })
    return row?.id ?? (yield* Effect.die(new Error("no copy id returned")))
  })

const setProject = (copy: number, data: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    yield* db
      .insert(localProjects)
      .values({ copy, data })
      .onConflictDoUpdate({ target: localProjects.copy, set: { data } })
  })

const DROP_BATCH = 5000

export const dropCopyBatch = (copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        const tickets = (yield* db
          .select({ id: localTickets.id })
          .from(localTickets)
          .where(eq(localTickets.copy, copy))
          .limit(DROP_BATCH)).map((row) => row.id)
        if (tickets.length > 0) {
          yield* removeFacts(copy, "tickets", tickets)
          return false
        }
        const members = yield* db
          .select({ group: localGroupMembers.groupId })
          .from(localGroupMembers)
          .where(eq(localGroupMembers.copy, copy))
          .limit(DROP_BATCH)
        if (members.length > 0) {
          yield* removeGroupMembers(copy, [
            ...new Set(members.map((row) => row.group))
          ])
          return false
        }
        for (const table of COPY_TABLES)
          yield* db.delete(table).where(eq(table.copy, copy))
        yield* db.delete(localCopies).where(eq(localCopies.id, copy))
        return true
      })
    )
  })

const stagingRow = (scope: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [row] = yield* db
      .select()
      .from(localStaging)
      .where(eq(localStaging.scope, scope))
    return row ?? null
  })

export const stagingOf = stagingRow

export const syncOf = syncRow

export const beginStaging = (scope: string, page: SnapshotPage) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    const { start } = page
    if (start === null)
      return yield* Effect.die(new Error("a snapshot starts with a start page"))
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        const previous = yield* stagingRow(scope)
        const copy = yield* newCopy(scope)
        const json = jsonRowsOf(start)
        yield* setProject(copy, projectJson(start.project))
        for (const kind of JSON_KINDS) yield* writeJson(copy, kind, json[kind])
        yield* writeTickets(copy, page.tickets, true)
        yield* writeMembers(copy, page.groupMembers)
        const row = {
          scope,
          copy,
          base: page.base,
          next: page.next,
          git: page.git ? 1 : 0
        }
        yield* db
          .insert(localStaging)
          .values(row)
          .onConflictDoUpdate({ target: localStaging.scope, set: row })
        return previous?.copy ?? null
      })
    )
  })

export const applyPage = (
  scope: string,
  requested: string,
  page: SnapshotPage
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        const staging = yield* stagingRow(scope)
        if (staging === null || staging.next !== requested)
          return "stale" satisfies Applied
        yield* writeTickets(staging.copy, page.tickets, true)
        yield* writeMembers(staging.copy, page.groupMembers)
        yield* db
          .update(localStaging)
          .set({ next: page.next })
          .where(eq(localStaging.scope, scope))
        return "applied" satisfies Applied
      })
    )
  })

export const publishStaging = (scope: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        const staging = yield* stagingRow(scope)
        if (staging === null || staging.next !== null) return null
        const current = yield* syncRow(scope)
        const row = {
          scope,
          copy: staging.copy,
          cursor: staging.base,
          git: staging.git
        }
        yield* db
          .insert(localSync)
          .values(row)
          .onConflictDoUpdate({ target: localSync.scope, set: row })
        yield* db.delete(localStaging).where(eq(localStaging.scope, scope))
        return { retired: current?.copy ?? null }
      })
    )
  })

const CHANGE_CHUNK = 2000

const writeChanges = (copy: number, changes: ProjectChanges) =>
  Effect.gen(function* () {
    const json = jsonRowsOf(changes.upserts)
    if (changes.project !== null)
      yield* setProject(copy, projectJson(changes.project))
    for (const kind of KINDS)
      yield* removeFacts(copy, kind, changes.deletes[kind])
    yield* writeTickets(copy, changes.upserts.tickets, false)
    yield* removeGroupMembers(
      copy,
      changes.upserts.groups.map((group) => group.id)
    )
    yield* writeMembers(copy, membersOf(changes.upserts.groups))
    for (const kind of JSON_KINDS) yield* writeJson(copy, kind, json[kind])
  })

export const applyChanges = (
  scope: string,
  base: SyncCursor,
  changes: ProjectChanges,
  write: <A, E, R>(
    transaction: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient.SqlClient
    const db = yield* LocalDb
    const inTransaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      write(sqlClient.withTransaction(effect))
    const tickets = changes.upserts.tickets
    const early = Arr.chunksOf(tickets, CHANGE_CHUNK).slice(0, -1)
    for (const chunk of early) {
      const written = yield* inTransaction(
        Effect.gen(function* () {
          const current = yield* syncRow(scope)
          if (current === null || current.cursor !== base) return false
          yield* writeTickets(current.copy, chunk, false)
          return true
        })
      )
      if (!written) return "stale" satisfies Applied
    }
    const rest = tickets.slice(early.length * CHANGE_CHUNK)
    return yield* inTransaction(
      Effect.gen(function* () {
        const current = yield* syncRow(scope)
        if (current === null || current.cursor !== base)
          return "stale" satisfies Applied
        yield* writeChanges(current.copy, {
          ...changes,
          upserts: { ...changes.upserts, tickets: rest }
        })
        yield* db
          .update(localSync)
          .set({ cursor: changes.cursor })
          .where(eq(localSync.scope, scope))
        return "applied" satisfies Applied
      })
    )
  })

export const forget = (scope: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        const copies = (yield* db
          .select({ id: localCopies.id })
          .from(localCopies)
          .where(eq(localCopies.scope, scope))).map((row) => row.id)
        yield* db.delete(localSync).where(eq(localSync.scope, scope))
        yield* db.delete(localStaging).where(eq(localStaging.scope, scope))
        return copies
      })
    )
  })

export const readFacts = (scope: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const current = yield* syncRow(scope)
    const copy = current?.copy ?? -1
    const read = (kind: FactKind) => {
      const table = kind === "tickets" ? localTicketData : JSON_TABLES[kind]
      return db
        .select({ id: table.id, data: table.data })
        .from(table)
        .where(eq(table.copy, copy))
        .orderBy(asc(table.id))
    }
    const [project] = yield* db
      .select({ data: localProjects.data })
      .from(localProjects)
      .where(eq(localProjects.copy, copy))
    return {
      cursor: current?.cursor ?? null,
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
