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

import { LocalDb, type Write, type Writer } from "./LocalDb"
import { localOrderKey, storedOrderKey } from "./orderKey"
import {
  applyIntents,
  covers,
  decodeEdits,
  decodeFact,
  decodeGroups,
  encodeEdits,
  encodeGroups,
  encodeWrite,
  decodeWrite,
  type Intent,
  type PendingEdit,
  type PendingWrite,
  type TicketState
} from "./pending"
import { deriveCopy, deriveTouched } from "./sectionKeys"
import {
  localCopies,
  localGroupMembers,
  localGroups,
  localMembers,
  localPendingBase,
  localPendingOps,
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

const SLICE_TICKETS = 250

const SLICE_MEMBERS = 5000

const idList = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(Schema.String))
)

const json = <S extends Schema.Top & { readonly EncodingServices: never }>(
  schema: S
) => Schema.encodeSync(Schema.fromJsonString(schema))

const ticketJson = json(TicketFact)
const groupJson = json(GroupHeader)
const statusJson = json(StatusFact)
const tagJson = json(TagFact)
const memberJson = json(MemberFact)
const projectJson = json(ProjectFact)
const decodeHeader = Schema.decodeUnknownSync(
  Schema.fromJsonString(GroupHeader)
)
const decodeProject = Schema.decodeUnknownSync(
  Schema.fromJsonString(ProjectFact)
)

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
  localProjects,
  localPendingBase
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

const {
  sprint: _sprint,
  epicSection: _epicSection,
  parentSection: _parentSection,
  ...writtenTicketColumns
} = getTableColumns(localTickets)

const excludedTicket = excluded(writtenTicketColumns)

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
      facts.map((fact) => ({ copy, id: fact.id, data: JSON.stringify(fact) })),
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
      (rows) =>
        db
          .insert(localGroupMembers)
          .values(rows)
          .onConflictDoUpdate({
            target: [
              localGroupMembers.copy,
              localGroupMembers.groupId,
              localGroupMembers.ticket
            ],
            set: { position: sql.raw("excluded.position") }
          })
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

const DROP_BATCH = 1000

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

type Slice = Readonly<{
  tickets: ReadonlyArray<TicketFact>
  members: ReadonlyArray<GroupMemberFact>
}>

const slicesOf = (page: SnapshotPage): ReadonlyArray<Slice> => {
  const slices = [
    ...Arr.chunksOf(page.tickets, SLICE_TICKETS).map((tickets) => ({
      tickets,
      members: []
    })),
    ...Arr.chunksOf(page.groupMembers, SLICE_MEMBERS).map((members) => ({
      tickets: [],
      members
    }))
  ]
  return slices.length === 0 ? [{ tickets: [], members: [] }] : slices
}

const holdsTicket = (copy: number, id: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [row] = yield* db
      .select({ id: localTickets.id })
      .from(localTickets)
      .where(and(eq(localTickets.copy, copy), eq(localTickets.id, id)))
    return row !== undefined
  })

const writeSlices = (
  copy: number,
  slices: ReadonlyArray<Slice>,
  from: number,
  readsWaiting: Writer["readsWaiting"]
) =>
  Effect.gen(function* () {
    let reached = from
    for (const slice of slices.slice(from)) {
      const first = slice.tickets[0]
      const fresh = first === undefined || !(yield* holdsTicket(copy, first.id))
      yield* writeTickets(copy, slice.tickets, fresh)
      yield* writeMembers(copy, slice.members)
      reached += 1
      if (yield* readsWaiting) break
    }
    return reached
  })

const unpublishedCopies = (scope: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const published = yield* copyOf(scope)
    return (yield* db
      .select({ id: localCopies.id })
      .from(localCopies)
      .where(eq(localCopies.scope, scope)))
      .map((row) => row.id)
      .filter((id) => id !== published)
  })

export const beginStaging = (
  scope: string,
  page: SnapshotPage,
  writer: Writer
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    const { start } = page
    if (start === null)
      return yield* Effect.die(new Error("a snapshot starts with a start page"))
    const begun = yield* writer.write(
      sqlClient.withTransaction(
        Effect.gen(function* () {
          const abandoned = yield* unpublishedCopies(scope)
          const copy = yield* newCopy(scope)
          const json = jsonRowsOf(start)
          yield* setProject(copy, projectJson(start.project))
          for (const kind of JSON_KINDS)
            yield* writeJson(copy, kind, json[kind])
          return { copy, abandoned }
        })
      )
    )
    const slices = slicesOf(page)
    let reached = 0
    while (reached < slices.length)
      reached = yield* writer.write(
        sqlClient.withTransaction(
          Effect.gen(function* () {
            const next = yield* writeSlices(
              begun.copy,
              slices,
              reached,
              writer.readsWaiting
            )
            if (next < slices.length) return next
            const row = {
              scope,
              copy: begun.copy,
              base: page.base,
              next: page.next,
              git: page.git ? 1 : 0
            }
            yield* db
              .insert(localStaging)
              .values(row)
              .onConflictDoUpdate({ target: localStaging.scope, set: row })
            return next
          })
        )
      )
    return begun.abandoned
  })

export const applyPage = (
  scope: string,
  requested: string,
  page: SnapshotPage,
  writer: Writer
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    const slices = slicesOf(page)
    let reached = 0
    while (reached < slices.length) {
      const next = yield* writer.write(
        sqlClient.withTransaction(
          Effect.gen(function* () {
            const staging = yield* stagingRow(scope)
            if (staging === null || staging.next !== requested) return null
            const next = yield* writeSlices(
              staging.copy,
              slices,
              reached,
              writer.readsWaiting
            )
            if (next === slices.length)
              yield* db
                .update(localStaging)
                .set({ next: page.next })
                .where(eq(localStaging.scope, scope))
            return next
          })
        )
      )
      if (next === null) return "stale" satisfies Applied
      reached = next
    }
    return "applied" satisfies Applied
  })

export const publishStaging = (scope: string, writer: Writer) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    const staged = yield* stagingRow(scope)
    if (staged === null || staged.next !== null) return null
    yield* deriveCopy(staged.copy, writer)
    return yield* writer.write(
      sqlClient.withTransaction(
        Effect.gen(function* () {
          const staging = yield* stagingRow(scope)
          if (
            staging === null ||
            staging.next !== null ||
            staging.copy !== staged.copy
          )
            return null
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
          yield* settlePending(scope, staging.copy, staging.base)
          yield* overlayPending(scope, staging.copy)
          return { retired: current?.copy ?? null }
        })
      )
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
    yield* deriveTouched(copy, {
      tickets: changes.upserts.tickets.map((fact) => fact.id),
      deletedTickets: changes.deletes.tickets,
      groups: [
        ...changes.deletes.groups,
        ...changes.upserts.groups.map((group) => group.id)
      ]
    })
  })

export const applyChanges = (
  scope: string,
  base: SyncCursor,
  changes: ProjectChanges,
  write: Write
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
          yield* unapplyPending(current.copy)
          yield* writeTickets(current.copy, chunk, false)
          yield* deriveTouched(current.copy, {
            tickets: chunk.map((fact) => fact.id),
            deletedTickets: [],
            groups: []
          })
          yield* overlayPending(scope, current.copy)
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
        yield* unapplyPending(current.copy)
        yield* writeChanges(current.copy, {
          ...changes,
          upserts: { ...changes.upserts, tickets: rest }
        })
        yield* db
          .update(localSync)
          .set({ cursor: changes.cursor })
          .where(eq(localSync.scope, scope))
        yield* settlePending(scope, current.copy, changes.cursor)
        yield* overlayPending(scope, current.copy)
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

const visibleState = (copy: number, id: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [row] = yield* db
      .select({ data: localTicketData.data })
      .from(localTicketData)
      .where(and(eq(localTicketData.copy, copy), eq(localTicketData.id, id)))
    if (row === undefined) return null
    const groups = yield* db
      .select({
        group: localGroupMembers.groupId,
        position: localGroupMembers.position
      })
      .from(localGroupMembers)
      .where(
        and(eq(localGroupMembers.copy, copy), eq(localGroupMembers.ticket, id))
      )
    return { fact: decodeFact(row.data), groups } satisfies TicketState
  })

const writeState = (copy: number, state: TicketState) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    yield* writeTickets(copy, [state.fact], false)
    yield* db
      .delete(localGroupMembers)
      .where(
        and(
          eq(localGroupMembers.copy, copy),
          eq(localGroupMembers.ticket, state.fact.id)
        )
      )
    yield* writeMembers(
      copy,
      state.groups.map((member) => ({ ...member, ticket: state.fact.id }))
    )
    yield* deriveTouched(copy, {
      tickets: [state.fact.id],
      deletedTickets: [],
      groups: []
    })
  })

const pendingOps = (scope: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const rows = yield* db
      .select({
        id: localPendingOps.id,
        edits: localPendingOps.edits,
        write: localPendingOps.write,
        receipt: localPendingOps.receipt
      })
      .from(localPendingOps)
      .where(eq(localPendingOps.scope, scope))
      .orderBy(asc(localPendingOps.seq))
    return rows.map((row) => ({
      id: row.id,
      edits: decodeEdits(row.edits),
      write: decodeWrite(row.write),
      receipt: row.receipt
    }))
  })

const openSprintsOf = (copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const rows = yield* db
      .select({ data: localGroups.data })
      .from(localGroups)
      .where(eq(localGroups.copy, copy))
    return new Set(
      rows
        .map((row) => decodeHeader(row.data))
        .filter(
          (group) => group.kind === "sprint" && group.completedAt === null
        )
        .map((group) => group.id)
    )
  })

const unapplyPending = (copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const bases = yield* db
      .select()
      .from(localPendingBase)
      .where(eq(localPendingBase.copy, copy))
    for (const base of bases)
      yield* writeState(copy, {
        fact: decodeFact(base.data),
        groups: decodeGroups(base.groups)
      })
    if (bases.length > 0)
      yield* db.delete(localPendingBase).where(eq(localPendingBase.copy, copy))
  })

const overlayPending = (scope: string, copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const intents = new Map<string, Array<Intent>>()
    for (const op of yield* pendingOps(scope))
      for (const edit of op.edits)
        intents.set(edit.ticket, [
          ...(intents.get(edit.ticket) ?? []),
          ...edit.intents
        ])
    const bases = new Map(
      (yield* db
        .select()
        .from(localPendingBase)
        .where(eq(localPendingBase.copy, copy))).map((base) => [base.id, base])
    )
    const ids = new Set([...bases.keys(), ...intents.keys()])
    if (ids.size === 0) return
    const openSprints = yield* openSprintsOf(copy)
    for (const id of ids) {
      const stored = bases.get(id)
      const base =
        stored === undefined
          ? yield* visibleState(copy, id)
          : {
              fact: decodeFact(stored.data),
              groups: decodeGroups(stored.groups)
            }
      if (base === null) continue
      const remaining = intents.get(id) ?? []
      const where = and(
        eq(localPendingBase.copy, copy),
        eq(localPendingBase.id, id)
      )
      if (remaining.length === 0) {
        yield* writeState(copy, base)
        yield* db.delete(localPendingBase).where(where)
        continue
      }
      if (stored === undefined)
        yield* db.insert(localPendingBase).values({
          copy,
          id,
          data: ticketJson(base.fact),
          groups: encodeGroups(base.groups)
        })
      yield* writeState(copy, applyIntents(base, remaining, openSprints))
    }
  })

const settlePending = (scope: string, copy: number, cursor: SyncCursor) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [project] = yield* db
      .select({ data: localProjects.data })
      .from(localProjects)
      .where(eq(localProjects.copy, copy))
    if (project === undefined) return false
    const projectId = decodeProject(project.data).id
    const settled = (yield* pendingOps(scope)).flatMap((op) =>
      op.receipt !== null && covers(cursor, op.receipt, projectId)
        ? [op.id]
        : []
    )
    if (settled.length > 0)
      yield* db
        .delete(localPendingOps)
        .where(inArray(localPendingOps.id, settled))
    return settled.length > 0
  })

export type NewEdit = Readonly<{
  id: string
  write: PendingWrite
  edits: ReadonlyArray<PendingEdit>
}>

export const recordEdit = (scope: string, edit: NewEdit) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        yield* db.insert(localPendingOps).values({
          id: edit.id,
          scope,
          tickets: idList(edit.edits.map((change) => change.ticket)),
          edits: encodeEdits(edit.edits),
          write: encodeWrite(edit.write)
        })
        const copy = yield* copyOf(scope)
        if (copy !== null) yield* overlayPending(scope, copy)
      })
    )
  })

export const confirmEdit = (scope: string, id: string, receipt: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        yield* db
          .update(localPendingOps)
          .set({ receipt })
          .where(eq(localPendingOps.id, id))
        const current = yield* syncRow(scope)
        if (current === null) return false
        const settled = yield* settlePending(
          scope,
          current.copy,
          current.cursor
        )
        if (settled) yield* overlayPending(scope, current.copy)
        return settled
      })
    )
  })

export const rejectEdit = (scope: string, id: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const sqlClient = yield* SqlClient.SqlClient
    return yield* sqlClient.withTransaction(
      Effect.gen(function* () {
        yield* db.delete(localPendingOps).where(eq(localPendingOps.id, id))
        const copy = yield* copyOf(scope)
        if (copy !== null) yield* overlayPending(scope, copy)
      })
    )
  })

export const unsentEdits = (scope: string) =>
  Effect.map(pendingOps(scope), (ops) =>
    ops.flatMap((op) =>
      op.receipt === null ? [{ id: op.id, write: op.write }] : []
    )
  )
