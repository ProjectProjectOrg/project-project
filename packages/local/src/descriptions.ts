import {
  compareDescriptionRevisions,
  type GroupId,
  sprintState,
  type TicketDescription,
  type TicketFact
} from "@pp/shared"
import { and, asc, eq, inArray, isNull, notExists, sql } from "drizzle-orm"
import * as Arr from "effect/Array"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
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
import { LocalDb } from "./LocalDb"
import {
  type DescriptionRequest,
  type LocalDescription,
  type LocalProject,
  type PrefetchDescriptionsRequest,
  type ResolveDescriptionRequest,
  type SaveDescriptionRequest,
  scopeOf,
  type TicketDataRequest
} from "./LocalRpcs"
import { groupMembership } from "./sprints"
import { copyOf } from "./store"
import {
  localDescriptionEdits,
  localDescriptions,
  localTicketCache,
  localTicketData
} from "./tables"

export const DESCRIPTION_BUDGET = 4_000_000
export const TICKET_DATA_BUDGET = 4_000_000
const FETCH_CHUNK = 100
const SPRINT_PREFETCH_LIMIT = 200

export const descriptionKey = (scope: string, id: string) =>
  `local-description:${scope}/${id}`

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

const evictDescriptions = (budget: number) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const [total] = yield* db
      .select({
        size: sql<number>`coalesce(sum(length(${localDescriptions.body})), 0)`
      })
      .from(localDescriptions)
    let excess = (total?.size ?? 0) - budget
    if (excess <= 0) return
    const candidates = yield* db
      .select({
        scope: localDescriptions.scope,
        id: localDescriptions.id,
        size: sql<number>`length(${localDescriptions.body})`
      })
      .from(localDescriptions)
      .where(
        notExists(
          db
            .select({ one: sql`1` })
            .from(localDescriptionEdits)
            .where(
              and(
                eq(localDescriptionEdits.scope, localDescriptions.scope),
                eq(localDescriptionEdits.id, localDescriptions.id)
              )
            )
        )
      )
      .orderBy(asc(localDescriptions.used))
    for (const candidate of candidates) {
      if (excess <= 0) return
      yield* db
        .delete(localDescriptions)
        .where(
          and(
            eq(localDescriptions.scope, candidate.scope),
            eq(localDescriptions.id, candidate.id)
          )
        )
      excess -= candidate.size
    }
  })

export const storeDescriptions = (
  scope: string,
  descriptions: ReadonlyArray<TicketDescription>,
  budget = DESCRIPTION_BUDGET
) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const now = yield* Clock.currentTimeMillis
    const stored: Array<string> = []
    for (const description of descriptions) {
      const held = yield* descriptionRow(scope, description.id)
      if (held !== null && isOlder(description.revision, held.revision))
        continue
      const row = {
        scope,
        id: description.id,
        body: description.body,
        revision: description.revision,
        missing: encodeMissing(description.missingAttachments),
        used: held?.used ?? now
      }
      yield* db
        .insert(localDescriptions)
        .values(row)
        .onConflictDoUpdate({
          target: [localDescriptions.scope, localDescriptions.id],
          set: row
        })
      stored.push(description.id)
    }
    yield* evictDescriptions(budget)
    return stored
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

const touch = (scope: string, id: string) =>
  Effect.gen(function* () {
    const db = yield* LocalDb
    const now = yield* Clock.currentTimeMillis
    yield* db
      .update(localDescriptions)
      .set({ used: now })
      .where(
        and(eq(localDescriptions.scope, scope), eq(localDescriptions.id, id))
      )
  })

const sprintTickets = (scope: string) =>
  Effect.gen(function* () {
    const copy = yield* copyOf(scope)
    if (copy === null) return []
    const now = yield* DateTime.nowAsDate
    const { sprints, ticketsOf } = yield* groupMembership(copy)
    return sprints
      .filter((sprint) => sprintState(sprint, now) === "active")
      .flatMap(
        (sprint: Readonly<{ id: GroupId }>) => ticketsOf.get(sprint.id) ?? []
      )
      .slice(0, SPRINT_PREFETCH_LIMIT)
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

  const layerScope = yield* Effect.scope

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
          const described = yield* describe(scope, request.id)
          if (described !== null)
            yield* touch(scope, request.id).pipe(Effect.forkIn(layerScope))
          return described
        })
      ),
    prefetch: (request: PrefetchDescriptionsRequest) =>
      local(
        Effect.gen(function* () {
          const scope = scopeOf(request.project)
          const sprint = request.sprint ? yield* sprintTickets(scope) : []
          const stale = yield* staleDescriptions(scope, [
            ...new Set([...request.ids, ...sprint])
          ])
          yield* enqueue(scope, stale)
        })
      ),
    notice: (scope: string, tickets: ReadonlyArray<TicketFact>) =>
      local(
        Effect.gen(function* () {
          const db = yield* LocalDb
          if (tickets.length === 0) return
          const held = new Set(
            (yield* db
              .select({ id: localDescriptions.id })
              .from(localDescriptions)
              .where(
                and(
                  eq(localDescriptions.scope, scope),
                  inArray(
                    localDescriptions.id,
                    tickets.map((ticket) => ticket.id)
                  )
                )
              )).map((row) => row.id)
          )
          const stale = yield* staleDescriptions(
            scope,
            tickets.flatMap((ticket) =>
              held.has(ticket.id) ? [ticket.id] : []
            )
          )
          yield* enqueue(scope, stale)
        })
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
