import {
  compareDescriptionRevisions,
  type DescriptionPage,
  GroupDetail,
  GroupHeader,
  type ProjectChanges,
  type TicketDescription
} from "@pp/shared"
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Random from "effect/Random"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as Semaphore from "effect/Semaphore"
import * as SqlClient from "effect/sql/SqlClient"

import { mergeDescriptions } from "./descriptionMerge"
import { DescriptionSource } from "./DescriptionSource"
import { LocalDb, timed, type Writer } from "./LocalDb"
import {
  type DescriptionRequest,
  type LocalDescription,
  type LocalProject,
  type ResolveDescriptionRequest,
  type SaveDescriptionRequest,
  scopeOf,
  type TicketDataRequest
} from "./LocalRpcs"
import { copyOf } from "./store"
import {
  localDescriptionEdits,
  localDescriptions,
  localDescriptionSync,
  localGroupDescriptions,
  localGroupMembers,
  localGroups,
  localTicketCache,
  localTicketData,
  localTickets
} from "./tables"

export const TICKET_DATA_BUDGET = 4_000_000
const FETCH_CHUNK = 100
const SLICE = 100
const RECONCILE_SLICE = 1000

export const descriptionKey = (scope: string, id: string) =>
  `local-description:${scope}/${id}`

export const groupDescriptionKey = (scope: string, id: string) =>
  `local-group-description:${scope}/${id}`

const projectOf = (scope: string): LocalProject => {
  const [orgSlug = "", slug = ""] = scope.split("/")
  return { orgSlug, slug }
}

const operationId = Effect.map(
  Effect.all(Array.from({ length: 4 }, () => Random.nextInt)),
  (parts) => parts.map((part) => Math.abs(part).toString(36)).join("_")
)

const isOlder = (revision: string, than: string) =>
  compareDescriptionRevisions(revision, than) < 0

const MissingJson = Schema.fromJsonString(Schema.Array(Schema.String))
const decodeMissing = Schema.decodeUnknownSync(MissingJson)
const encodeMissing = Schema.encodeSync(MissingJson)

const descriptionRow = (scope: string, id: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [row] = yield* db
      .select()
      .from(localDescriptions)
      .where(
        and(eq(localDescriptions.scope, scope), eq(localDescriptions.id, id))
      )
    return row ?? null
  })

const editRow = (scope: string, id: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [row] = yield* db
      .select()
      .from(localDescriptionEdits)
      .where(
        and(
          eq(localDescriptionEdits.scope, scope),
          eq(localDescriptionEdits.id, id)
        )
      )
    return row ?? null
  })

const factRevisions = (scope: string, ids: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const copy = yield* copyOf(scope)
    if (copy === null || ids.length === 0) return new Map<string, string>()
    const rows = yield* db
      .select({
        id: localTicketData.id,
        revision: sql<
          string | null
        >`json_extract(${localTicketData.data}, '$.descriptionRevision')`
      })
      .from(localTicketData)
      .where(
        and(
          eq(localTicketData.copy, copy),
          inArray(localTicketData.id, [...ids])
        )
      )
    return new Map(
      rows.flatMap((row) =>
        row.revision === null ? [] : [[row.id, row.revision] as const]
      )
    )
  })

export const staleDescriptions = (scope: string, ids: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    if (ids.length === 0) return []
    const cached = new Map(
      (yield* db
        .select({
          id: localDescriptions.id,
          revision: localDescriptions.revision
        })
        .from(localDescriptions)
        .where(
          and(
            eq(localDescriptions.scope, scope),
            inArray(localDescriptions.id, [...ids])
          )
        )).map((row) => [row.id, row.revision] as const)
    )
    const facts = yield* factRevisions(scope, ids)
    return ids.filter((id) => {
      const held = cached.get(id)
      const current = facts.get(id)
      return (
        held === undefined || (current !== undefined && isOlder(held, current))
      )
    })
  })

const heldRevisions = (
  table: typeof localDescriptions | typeof localGroupDescriptions,
  scope: string,
  ids: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    if (ids.length === 0) return new Map<string, string>()
    const rows = yield* db
      .select({ id: table.id, revision: table.revision })
      .from(table)
      .where(and(eq(table.scope, scope), inArray(table.id, [...ids])))
    return new Map(rows.map((row) => [row.id, row.revision] as const))
  })

const newerThanHeld = <A extends Readonly<{ id: string; revision: string }>>(
  held: ReadonlyMap<string, string>,
  incoming: ReadonlyArray<A>
) =>
  incoming.filter((item) => {
    const revision = held.get(item.id)
    return revision === undefined || !isOlder(item.revision, revision)
  })

export const storeDescriptions = (
  scope: string,
  descriptions: ReadonlyArray<TicketDescription>
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const fresh = newerThanHeld(
      yield* heldRevisions(
        localDescriptions,
        scope,
        descriptions.map((description) => description.id)
      ),
      descriptions
    )
    if (fresh.length > 0)
      yield* db
        .insert(localDescriptions)
        .values(
          fresh.map((description) => ({
            scope,
            id: description.id,
            body: description.body,
            revision: description.revision,
            missing: encodeMissing(description.missingAttachments)
          }))
        )
        .onConflictDoUpdate({
          target: [localDescriptions.scope, localDescriptions.id],
          set: {
            body: sql.raw("excluded.body"),
            revision: sql.raw("excluded.revision"),
            missing: sql.raw("excluded.missing")
          }
        })
    return fresh.map((description) => description.id)
  })

type GroupBody = Readonly<{ id: string; body: string; revision: string }>

export const storeGroupDescriptions = (
  scope: string,
  groups: ReadonlyArray<GroupBody>
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const fresh = newerThanHeld(
      yield* heldRevisions(
        localGroupDescriptions,
        scope,
        groups.map((group) => group.id)
      ),
      groups
    )
    if (fresh.length > 0)
      yield* db
        .insert(localGroupDescriptions)
        .values(fresh.map((group) => ({ scope, ...group })))
        .onConflictDoUpdate({
          target: [localGroupDescriptions.scope, localGroupDescriptions.id],
          set: {
            body: sql.raw("excluded.body"),
            revision: sql.raw("excluded.revision")
          }
        })
    return fresh.map((group) => group.id)
  })

const removeFrom = (
  table: typeof localDescriptions | typeof localGroupDescriptions,
  scope: string,
  ids: ReadonlyArray<string>
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    for (const chunk of Arr.chunksOf(ids, RECONCILE_SLICE))
      yield* db
        .delete(table)
        .where(and(eq(table.scope, scope), inArray(table.id, [...chunk])))
  })

const syncState = (scope: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [row] = yield* db
      .select()
      .from(localDescriptionSync)
      .where(eq(localDescriptionSync.scope, scope))
    return row ?? null
  })

const setSyncState = (row: typeof localDescriptionSync.$inferInsert) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    yield* db
      .insert(localDescriptionSync)
      .values(row)
      .onConflictDoUpdate({ target: localDescriptionSync.scope, set: row })
  })

const missingFrom = (scope: string, copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const wanted: Array<string> = []
    let after = ""
    while (true) {
      const rows = yield* db
        .select({
          id: localTicketData.id,
          revision: sql<
            string | null
          >`json_extract(${localTicketData.data}, '$.descriptionRevision')`
        })
        .from(localTicketData)
        .where(
          and(eq(localTicketData.copy, copy), gt(localTicketData.id, after))
        )
        .orderBy(asc(localTicketData.id))
        .limit(RECONCILE_SLICE)
      const last = rows.at(-1)
      if (last === undefined) return wanted
      const held = yield* heldRevisions(
        localDescriptions,
        scope,
        rows.map((row) => row.id)
      )
      for (const row of rows) {
        const revision = held.get(row.id)
        if (
          revision === undefined ||
          (row.revision !== null && isOlder(revision, row.revision))
        )
          wanted.push(row.id)
      }
      after = last.id
    }
  })

const orphansOf = (scope: string, copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const orphans: Array<string> = []
    let after = ""
    while (true) {
      const rows = yield* db
        .select({
          id: localDescriptions.id,
          present: sql<number>`exists (select 1 from ${localTickets} where ${localTickets.copy} = ${copy} and ${localTickets.id} = ${localDescriptions.id})`
        })
        .from(localDescriptions)
        .where(
          and(
            eq(localDescriptions.scope, scope),
            gt(localDescriptions.id, after)
          )
        )
        .orderBy(asc(localDescriptions.id))
        .limit(RECONCILE_SLICE)
      const last = rows.at(-1)
      if (last === undefined) return orphans
      for (const row of rows) if (row.present === 0) orphans.push(row.id)
      after = last.id
    }
  })

const orphanGroupsOf = (scope: string, copy: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const rows = yield* db
      .select({
        id: localGroupDescriptions.id,
        present: sql<number>`exists (select 1 from ${localGroups} where ${localGroups.copy} = ${copy} and ${localGroups.id} = ${localGroupDescriptions.id})`
      })
      .from(localGroupDescriptions)
      .where(eq(localGroupDescriptions.scope, scope))
    return rows.flatMap((row) => (row.present === 0 ? [row.id] : []))
  })

const decodeHeader = Schema.decodeUnknownSync(
  Schema.fromJsonString(GroupHeader)
)
const decodeGroupDetail = Schema.decodeUnknownSync(Schema.toType(GroupDetail))

export const localGroupDetail = (scope: string, copy: number, id: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [group] = yield* db
      .select({ data: localGroups.data })
      .from(localGroups)
      .where(and(eq(localGroups.copy, copy), eq(localGroups.id, id)))
    const [description] = yield* db
      .select({ body: localGroupDescriptions.body })
      .from(localGroupDescriptions)
      .where(
        and(
          eq(localGroupDescriptions.scope, scope),
          eq(localGroupDescriptions.id, id)
        )
      )
    if (group === undefined || description === undefined) return null
    const members = yield* db
      .select({ ticket: localGroupMembers.ticket })
      .from(localGroupMembers)
      .where(
        and(eq(localGroupMembers.copy, copy), eq(localGroupMembers.groupId, id))
      )
      .orderBy(asc(localGroupMembers.position))
    return decodeGroupDetail({
      ...decodeHeader(group.data),
      tickets: members.map((member) => member.ticket),
      body: description.body
    })
  })

export const describe = (scope: string, id: string) =>
  Effect.gen(function* () {
    const row = yield* descriptionRow(scope, id)
    if (row === null) return null
    const edit = yield* editRow(scope, id)
    return {
      server: { body: row.body, revision: row.revision },
      missingAttachments: decodeMissing(row.missing),
      edit:
        edit === null
          ? null
          : {
              body: edit.body,
              base: { body: edit.baseBody, revision: edit.baseRevision },
              conflict:
                edit.conflictBody === null || edit.conflictRevision === null
                  ? null
                  : {
                      body: edit.conflictBody,
                      revision: edit.conflictRevision
                    },
              failed: edit.failed
            }
    } satisfies LocalDescription
  })

export const recordEdit = (request: SaveDescriptionRequest) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const scope = scopeOf(request.project)
    const where = and(
      eq(localDescriptionEdits.scope, scope),
      eq(localDescriptionEdits.id, request.id)
    )
    const edit = yield* editRow(scope, request.id)
    if (edit === null) {
      if (request.body === request.base.body) return
      yield* db.insert(localDescriptionEdits).values({
        scope,
        id: request.id,
        body: request.body,
        baseBody: request.base.body,
        baseRevision: request.base.revision
      })
      return
    }
    if (
      request.body === edit.baseBody &&
      edit.operation === null &&
      edit.conflictRevision === null
    ) {
      yield* db.delete(localDescriptionEdits).where(where)
      return
    }
    yield* db
      .update(localDescriptionEdits)
      .set({ body: request.body, failed: null })
      .where(where)
  })

type Edit = NonNullable<Effect.Success<ReturnType<typeof editRow>>>

const rebase = (
  scope: string,
  edit: Edit,
  base: string,
  theirs: TicketDescription
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const where = and(
      eq(localDescriptionEdits.scope, scope),
      eq(localDescriptionEdits.id, edit.id)
    )
    const merged = mergeDescriptions(base, edit.body, theirs.body)
    if (merged._tag === "Conflict") {
      yield* db
        .update(localDescriptionEdits)
        .set({
          operation: null,
          sent: null,
          conflictBody: theirs.body,
          conflictRevision: theirs.revision
        })
        .where(where)
      return "blocked" as const
    }
    if (merged.body === theirs.body) {
      yield* db.delete(localDescriptionEdits).where(where)
      return "done" as const
    }
    yield* db
      .update(localDescriptionEdits)
      .set({
        body: merged.body,
        baseBody: theirs.body,
        baseRevision: theirs.revision,
        operation: null,
        sent: null
      })
      .where(where)
    return "again" as const
  })

export const settleSaved = (
  scope: string,
  id: string,
  operation: string,
  sent: string,
  saved: TicketDescription
) =>
  Effect.gen(function* () {
    yield* storeDescriptions(scope, [saved])
    const edit = yield* editRow(scope, id)
    if (edit === null || edit.operation !== operation) return "done" as const
    return yield* rebase(scope, edit, sent, saved)
  })

export const settleChanged = (
  scope: string,
  id: string,
  operation: string,
  theirs: TicketDescription
) =>
  Effect.gen(function* () {
    yield* storeDescriptions(scope, [theirs])
    const edit = yield* editRow(scope, id)
    if (edit === null || edit.operation !== operation) return "done" as const
    return yield* rebase(scope, edit, edit.baseBody, theirs)
  })

const markFailed = (scope: string, id: string, reason: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    yield* db
      .update(localDescriptionEdits)
      .set({ failed: reason, operation: null, sent: null })
      .where(
        and(
          eq(localDescriptionEdits.scope, scope),
          eq(localDescriptionEdits.id, id)
        )
      )
  })

const claimOperation = (scope: string, id: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const edit = yield* editRow(scope, id)
    if (edit === null || edit.conflictRevision !== null || edit.failed !== null)
      return null
    if (edit.operation !== null && edit.sent !== null)
      return { edit, operation: edit.operation, sent: edit.sent }
    const operation = yield* operationId
    yield* db
      .update(localDescriptionEdits)
      .set({ operation, sent: edit.body })
      .where(
        and(
          eq(localDescriptionEdits.scope, scope),
          eq(localDescriptionEdits.id, id)
        )
      )
    return { edit, operation, sent: edit.body }
  })

export const resolveEdit = (request: ResolveDescriptionRequest) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const scope = scopeOf(request.project)
    const where = and(
      eq(localDescriptionEdits.scope, scope),
      eq(localDescriptionEdits.id, request.id)
    )
    const edit = yield* editRow(scope, request.id)
    if (
      edit === null ||
      edit.conflictBody === null ||
      edit.conflictRevision === null
    )
      return
    if (request.keep === "theirs") {
      yield* db.delete(localDescriptionEdits).where(where)
      return
    }
    yield* db
      .update(localDescriptionEdits)
      .set({
        baseBody: edit.conflictBody,
        baseRevision: edit.conflictRevision,
        conflictBody: null,
        conflictRevision: null
      })
      .where(where)
  })

export const cachedTicketData = (request: TicketDataRequest) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [row] = yield* db
      .select({ data: localTicketCache.data })
      .from(localTicketCache)
      .where(
        and(
          eq(localTicketCache.scope, scopeOf(request.project)),
          eq(localTicketCache.ticket, request.ticket),
          eq(localTicketCache.kind, request.kind)
        )
      )
    return row?.data ?? null
  })

export const cacheTicketData = (
  request: TicketDataRequest & Readonly<{ data: string }>,
  budget = TICKET_DATA_BUDGET
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const now = yield* Clock.currentTimeMillis
    const row = {
      scope: scopeOf(request.project),
      ticket: request.ticket,
      kind: request.kind,
      data: request.data,
      used: now
    }
    yield* db
      .insert(localTicketCache)
      .values(row)
      .onConflictDoUpdate({
        target: [
          localTicketCache.scope,
          localTicketCache.ticket,
          localTicketCache.kind
        ],
        set: row
      })
    const [total] = yield* db
      .select({
        size: sql<number>`coalesce(sum(length(${localTicketCache.data})), 0)`
      })
      .from(localTicketCache)
    let excess = (total?.size ?? 0) - budget
    if (excess <= 0) return
    const oldest = yield* db
      .select({
        scope: localTicketCache.scope,
        ticket: localTicketCache.ticket,
        kind: localTicketCache.kind,
        size: sql<number>`length(${localTicketCache.data})`
      })
      .from(localTicketCache)
      .orderBy(asc(localTicketCache.used))
    for (const entry of oldest) {
      if (excess <= 0) return
      yield* db
        .delete(localTicketCache)
        .where(
          and(
            eq(localTicketCache.scope, entry.scope),
            eq(localTicketCache.ticket, entry.ticket),
            eq(localTicketCache.kind, entry.kind)
          )
        )
      excess -= entry.size
    }
  })

const make = Effect.gen(function* () {
  const source = yield* DescriptionSource
  const sqlClient = yield* SqlClient.SqlClient
  const reactivity = yield* Reactivity.Reactivity
  const requests =
    yield* Queue.unbounded<Readonly<{ scope: string; id: string }>>()
  const requested = new Set<string>()
  const queued = new Set<string>()
  const locks = new Map<string, Semaphore.Semaphore>()
  const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    sqlClient.withTransaction(effect)
  const changed = (scope: string, ids: ReadonlyArray<string>) =>
    ids.length === 0
      ? Effect.void
      : reactivity.invalidate(ids.map((id) => descriptionKey(scope, id)))
  const groupsChanged = (scope: string, ids: ReadonlyArray<string>) =>
    ids.length === 0
      ? Effect.void
      : reactivity.invalidate(ids.map((id) => groupDescriptionKey(scope, id)))

  const layerScope = yield* Effect.scope
  const phase = yield* Semaphore.make(1)
  const filling = new Set<string>()

  const writePage = (
    scope: string,
    requested: string | null,
    page: DescriptionPage,
    writer: Writer
  ) =>
    Effect.gen(function* () {
      const slices: ReadonlyArray<ReadonlyArray<TicketDescription>> =
        page.descriptions.length === 0
          ? [[]]
          : Arr.chunksOf(page.descriptions, SLICE)
      let reached = 0
      while (reached < slices.length) {
        const from = reached
        const written = yield* writer.write(
          transaction(
            Effect.gen(function* () {
              const state = yield* syncState(scope)
              if (
                (state?.stage ?? "pages") !== "pages" ||
                (state?.next ?? null) !== requested
              )
                return null
              const groups =
                from === 0
                  ? yield* storeGroupDescriptions(scope, page.groups)
                  : []
              const stored: Array<string> = []
              let next = from
              for (const slice of slices.slice(from)) {
                stored.push(...(yield* storeDescriptions(scope, slice)))
                next += 1
                if (yield* writer.readsWaiting) break
              }
              if (next === slices.length)
                yield* setSyncState({
                  scope,
                  stage: page.next === null ? "reconcile" : "pages",
                  next: page.next,
                  copy: null
                })
              return { next, stored, groups }
            })
          )
        )
        if (written === null) return "stale" as const
        yield* changed(scope, written.stored)
        yield* groupsChanged(scope, written.groups)
        reached = written.next
      }
      return "written" as const
    })

  const pages = (project: LocalProject, from: string | null, writer: Writer) =>
    Effect.scoped(
      Effect.gen(function* () {
        const scope = scopeOf(project)
        let token = from
        let page = yield* source.page(project, token)
        while (true) {
          const following = page.next
          const ahead =
            following === null
              ? null
              : yield* Effect.forkScoped(source.page(project, following), {
                  startImmediately: true
                })
          if ((yield* writePage(scope, token, page, writer)) === "stale")
            return "stale" as const
          if (ahead === null) return "done" as const
          page = yield* Fiber.join(ahead)
          token = following
        }
      })
    )

  const fetchInto = (
    project: LocalProject,
    ids: ReadonlyArray<string>,
    writer: Writer
  ) =>
    Effect.scoped(
      Effect.gen(function* () {
        const scope = scopeOf(project)
        const chunks = Arr.chunksOf(ids, FETCH_CHUNK)
        const fetch = (index: number) => {
          const chunk = chunks[index]
          return chunk === undefined
            ? Effect.succeed(null)
            : Effect.forkScoped(source.fetch(project, chunk), {
                startImmediately: true
              })
        }
        let ahead = yield* fetch(0)
        for (let index = 0; ahead !== null; index += 1) {
          const fetched = yield* Fiber.join(ahead)
          ahead = yield* fetch(index + 1)
          yield* changed(
            scope,
            yield* writer.write(transaction(storeDescriptions(scope, fetched)))
          )
        }
      })
    )

  const reconcile = (project: LocalProject, copy: number, writer: Writer) =>
    Effect.gen(function* () {
      const scope = scopeOf(project)
      yield* fetchInto(project, yield* missingFrom(scope, copy), writer)
      const orphans = yield* orphansOf(scope, copy)
      const orphanGroups = yield* orphanGroupsOf(scope, copy)
      yield* writer.write(
        transaction(
          Effect.gen(function* () {
            yield* removeFrom(localDescriptions, scope, orphans)
            yield* removeFrom(localGroupDescriptions, scope, orphanGroups)
            yield* setSyncState({ scope, stage: "done", next: null, copy })
          })
        )
      )
      yield* changed(scope, orphans)
      yield* groupsChanged(scope, orphanGroups)
    })

  const fill = (project: LocalProject, writer: Writer) =>
    Effect.gen(function* () {
      const scope = scopeOf(project)
      while (true) {
        const copy = yield* copyOf(scope)
        if (copy === null) return
        const state = yield* syncState(scope)
        if (state === null || state.stage === "pages") {
          if ((yield* pages(project, state?.next ?? null, writer)) === "stale")
            return
          continue
        }
        if (state.stage === "done" && state.copy === copy) return
        yield* reconcile(project, copy, writer)
      }
    })

  const refreshGroups = (
    project: LocalProject,
    ids: ReadonlyArray<string>,
    revision: string
  ) =>
    Effect.gen(function* () {
      const scope = scopeOf(project)
      const held = yield* heldRevisions(localGroupDescriptions, scope, ids)
      for (const id of ids) {
        const current = held.get(id)
        if (current !== undefined && !isOlder(current, revision)) continue
        const body = yield* source.group(project, id)
        yield* transaction(
          body === null
            ? removeFrom(localGroupDescriptions, scope, [id])
            : storeGroupDescriptions(scope, [{ id, body, revision }])
        )
        yield* groupsChanged(scope, [id])
      }
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("local group descriptions fetch failed", cause)
      )
    )

  const enqueue = (scope: string, ids: ReadonlyArray<string>) =>
    Effect.forEach(
      ids.filter((id) => !requested.has(`${scope}/${id}`)),
      (id) => {
        requested.add(`${scope}/${id}`)
        return Queue.offer(requests, { scope, id })
      },
      { discard: true }
    )

  const fetchBatch = (
    batch: ReadonlyArray<Readonly<{ scope: string; id: string }>>
  ) =>
    Effect.forEach(
      Object.entries(Arr.groupBy(batch, (entry) => entry.scope)),
      ([scope, entries]) =>
        Effect.gen(function* () {
          const ids = [...new Set(entries.map((entry) => entry.id))]
          const stale = yield* staleDescriptions(scope, ids)
          for (let start = 0; start < stale.length; start += FETCH_CHUNK) {
            const chunk = stale.slice(start, start + FETCH_CHUNK)
            const fetched = yield* source.fetch(projectOf(scope), chunk)
            const stored = yield* transaction(storeDescriptions(scope, fetched))
            yield* changed(scope, stored)
          }
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("local descriptions fetch failed", cause)
          ),
          Effect.ensuring(
            Effect.sync(() => {
              for (const entry of entries)
                requested.delete(`${entry.scope}/${entry.id}`)
            })
          )
        ),
      { discard: true }
    )

  yield* Queue.takeAll(requests).pipe(
    Effect.flatMap(fetchBatch),
    Effect.forever,
    Effect.forkScoped
  )

  const lockFor = (key: string) =>
    Effect.sync(() => {
      const existing = locks.get(key)
      if (existing !== undefined) return existing
      const created = Semaphore.makeUnsafe(1)
      locks.set(key, created)
      return created
    })

  const flushOnce = (scope: string, id: string) =>
    Effect.gen(function* () {
      const claimed = yield* transaction(claimOperation(scope, id))
      if (claimed === null) return "done" as const
      const project = projectOf(scope)
      const outcome = yield* source.save(
        project,
        id,
        { body: claimed.sent, base: claimed.edit.baseRevision },
        claimed.operation
      )
      const settled = yield* Effect.gen(function* () {
        switch (outcome._tag) {
          case "Saved":
            return yield* transaction(
              settleSaved(
                scope,
                id,
                claimed.operation,
                claimed.sent,
                outcome.description
              )
            )
          case "Changed": {
            const [theirs] = yield* source.fetch(project, [id])
            if (theirs === undefined) {
              yield* transaction(markFailed(scope, id, "ticket_gone"))
              return "done" as const
            }
            return yield* transaction(
              settleChanged(scope, id, claimed.operation, theirs)
            )
          }
          case "Pending":
            yield* Effect.sleep("1 second")
            return "again" as const
          case "Rejected":
            yield* transaction(markFailed(scope, id, outcome.reason))
            return "done" as const
        }
      })
      yield* changed(scope, [id])
      return settled
    })

  const flush = (scope: string, id: string) =>
    flushOnce(scope, id).pipe(
      Effect.catchTag("SyncDenied", () =>
        transaction(markFailed(scope, id, "denied")).pipe(
          Effect.as("done" as const)
        )
      ),
      Effect.retry(
        Schedule.min([
          Schedule.exponential("2 seconds"),
          Schedule.spaced("1 minute")
        ])
      ),
      Effect.repeat({ while: (state) => state === "again" }),
      Effect.catchCause((cause) =>
        Effect.logWarning("local description save failed", cause)
      )
    )

  const kick = (scope: string, id: string) =>
    Effect.gen(function* () {
      const key = `${scope}/${id}`
      if (queued.has(key)) return
      queued.add(key)
      const lock = yield* lockFor(key)
      yield* Effect.suspend(() => {
        queued.delete(key)
        return flush(scope, id)
      }).pipe(Semaphore.withPermit(lock), Effect.forkIn(layerScope))
    })

  const pendingEdits = yield* Effect.gen(function* () {
    const db = yield* LocalDb
    return yield* db
      .select({
        scope: localDescriptionEdits.scope,
        id: localDescriptionEdits.id
      })
      .from(localDescriptionEdits)
      .where(
        and(
          isNull(localDescriptionEdits.conflictRevision),
          isNull(localDescriptionEdits.failed)
        )
      )
  }).pipe(Effect.orDie)
  for (const edit of pendingEdits) yield* kick(edit.scope, edit.id)

  const localDb = yield* LocalDb
  const local = <A, E>(effect: Effect.Effect<A, E, LocalDb>) =>
    Effect.provideService(effect, LocalDb, localDb)

  return {
    view: (request: DescriptionRequest) =>
      local(
        Effect.gen(function* () {
          const scope = scopeOf(request.project)
          const stale = yield* staleDescriptions(scope, [request.id])
          if (stale.length > 0) yield* enqueue(scope, stale)
          return yield* describe(scope, request.id)
        })
      ),
    start: (project: LocalProject, writer: Writer) =>
      Effect.suspend(() => {
        const scope = scopeOf(project)
        if (filling.has(scope)) return Effect.void
        filling.add(scope)
        return local(fill(project, writer)).pipe(
          timed(`descriptions ${scope}`),
          Semaphore.withPermit(phase),
          Effect.catchCause((cause) =>
            Effect.logWarning("local descriptions sync failed", cause)
          ),
          Effect.ensuring(Effect.sync(() => filling.delete(scope))),
          Effect.forkIn(layerScope),
          Effect.asVoid
        )
      }),
    notice: (project: LocalProject, changes: ProjectChanges) =>
      local(
        Effect.gen(function* () {
          const scope = scopeOf(project)
          const { tickets, groups } = changes.deletes
          if (tickets.length > 0 || groups.length > 0) {
            yield* transaction(
              Effect.andThen(
                removeFrom(localDescriptions, scope, tickets),
                removeFrom(localGroupDescriptions, scope, groups)
              )
            )
            yield* changed(scope, tickets)
            yield* groupsChanged(scope, groups)
          }
          const upserted = changes.upserts.tickets
          if (upserted.length > 0) {
            const held = yield* heldRevisions(
              localDescriptions,
              scope,
              upserted.map((ticket) => ticket.id)
            )
            const complete = (yield* syncState(scope))?.stage === "done"
            yield* enqueue(
              scope,
              upserted.flatMap((ticket) => {
                const revision = held.get(ticket.id)
                const wanted =
                  revision === undefined
                    ? complete
                    : isOlder(revision, ticket.descriptionRevision)
                return wanted ? [ticket.id] : []
              })
            )
          }
          if (changes.upserts.groups.length > 0)
            yield* local(
              refreshGroups(
                project,
                changes.upserts.groups.map((group) => group.id),
                changes.cursor
              )
            ).pipe(Effect.forkIn(layerScope))
        })
      ),
    forget: (scope: string) =>
      local(
        transaction(
          Effect.gen(function* () {
            const db = yield* LocalDb
            yield* db
              .delete(localDescriptions)
              .where(eq(localDescriptions.scope, scope))
            yield* db
              .delete(localGroupDescriptions)
              .where(eq(localGroupDescriptions.scope, scope))
            yield* db
              .delete(localDescriptionSync)
              .where(eq(localDescriptionSync.scope, scope))
          })
        )
      ),
    save: (request: SaveDescriptionRequest) =>
      local(
        Effect.gen(function* () {
          const scope = scopeOf(request.project)
          yield* transaction(recordEdit(request))
          yield* changed(scope, [request.id])
          yield* kick(scope, request.id)
        })
      ),
    resolve: (request: ResolveDescriptionRequest) =>
      local(
        Effect.gen(function* () {
          const scope = scopeOf(request.project)
          yield* transaction(resolveEdit(request))
          yield* changed(scope, [request.id])
          yield* kick(scope, request.id)
        })
      ),
    cached: (request: TicketDataRequest) => local(cachedTicketData(request)),
    cache: (request: TicketDataRequest & Readonly<{ data: string }>) =>
      local(cacheTicketData(request))
  }
})

export class LocalDescriptions extends Context.Service<
  LocalDescriptions,
  Effect.Success<typeof make>
>()("@pp/local/descriptions/LocalDescriptions") {}

export const localDescriptionsLayer = Layer.effect(LocalDescriptions, make)
