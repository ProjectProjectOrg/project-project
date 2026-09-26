import {
  matchesTicketQuery,
  padNumericIdSort,
  type GroupId,
  type QuickCreateTicketInput,
  type TagName,
  type Ticket,
  type TicketCounts,
  type TicketId,
  type TicketListRow,
  TicketListQuery,
  type TicketPriority,
  type TicketSort,
  type TicketStatus,
  type Unauthorized,
  type Forbidden,
  type NotFound,
  type UpdateTicketInput
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { compareCodePoints } from "@/lib/orderKey"
import { PRIORITY_META } from "@/lib/priority-meta"

import { countsRequest, ticketCounts } from "./ticketCounts"
import { applyTicketPatch } from "./ticketPatch"

export const encodeTicketListQuery = Schema.encodeSync(
  Schema.fromJsonString(TicketListQuery)
)

export type BacklogRequest = Readonly<{
  params: Readonly<{ orgSlug: string; readonly slug: string }>
  query: TicketListQuery
}>

type QueryWithView = TicketListQuery & Readonly<{ view?: unknown }>

const ticketListQueryOf = (query: QueryWithView): TicketListQuery => {
  const { view: _view, ...rest } = query
  return rest
}

/**
 * Build the request that identifies one backlog. Status filter and cursor are
 * dropped because the sections endpoint returns every status with its own first
 * page. This replaces the old `ticketsSectionsKey` string builder.
 */
export const backlogRequest = (
  orgSlug: string,
  slug: string,
  query: QueryWithView
): BacklogRequest => ({
  params: { orgSlug, slug },
  query: {
    ...ticketListQueryOf(query),
    status: undefined,
    cursor: undefined
  }
})

const scopeOf = (req: BacklogRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export type BacklogRow = Readonly<{
  ticket: Ticket
  /** React key. Equals the ticket id except for rows created in this session. */
  key: string
  /** Server sort position, or the matching local position while an edit is pending. */
  orderKey: string | null
  pending: boolean
}>

export type BacklogSection = Readonly<{
  items: ReadonlyArray<BacklogRow>
  nextCursor: string | null
}>

export type BacklogValue = Readonly<{
  counts: TicketCounts
  sections: Readonly<Record<string, BacklogSection>>
}>

const toRow = (row: TicketListRow): BacklogRow => ({
  ticket: row.ticket,
  key: row.ticket.id,
  orderKey: row.orderKey,
  pending: false
})

const sectionsQuery = (req: BacklogRequest) =>
  Api.query("tickets", "sections", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const loadedPagesAtom = Atom.family((_req: BacklogRequest) =>
  Atom.make<Readonly<Record<string, number>>>({}).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

/**
 * One cursor page. Registers `ticketPages` as well as `ticketsIn` so a mutation
 * can refresh pages without also re-invalidating the sections query, which the
 * optimistic wrapper already refreshes on commit.
 */
const pageQuery = (req: BacklogRequest, status: string, cursor: string) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: { ...req.query, status: [status as TicketStatus], cursor },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.ticketPages(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const dedupeById = (
  rows: ReadonlyArray<BacklogRow>
): ReadonlyArray<BacklogRow> => {
  const seen = new Set<string>()
  const out: Array<BacklogRow> = []
  for (const row of rows) {
    if (seen.has(row.ticket.id)) continue
    seen.add(row.ticket.id)
    out.push(row)
  }
  return out
}

/**
 * The composed backlog value. Task 6 extends this readable with loaded cursor
 * pages; the wrapper below never changes.
 */
const emptyBacklog = (): BacklogValue => ({
  counts: { total: 0, byStatus: {} },
  sections: {}
})

const backlogView = (req: BacklogRequest) =>
  Atom.readable(
    (get) => {
      const base = get(sectionsQuery(req))
      if (!AsyncResult.isSuccess(base)) {
        return AsyncResult.map(base, emptyBacklog)
      }
      const loaded = get(loadedPagesAtom(req))
      const createdKeys = get(createdKeysAtom(scopeOf(req)))
      const parts: Array<AsyncResult.AsyncResult<unknown, unknown>> = [base]
      const sections: Record<string, BacklogSection> = {}

      for (const [status, page] of Object.entries(base.value.sections)) {
        const rows: Array<BacklogRow> = page.items.map(toRow)
        let nextCursor = page.nextCursor
        const depth = loaded[status] ?? 0
        for (let index = 0; index < depth; index++) {
          if (nextCursor === null) break
          const cursor = nextCursor
          const result = get(pageQuery(req, status, cursor))
          parts.push(result)
          if (!AsyncResult.isSuccess(result)) break
          for (const item of result.value.items) rows.push(toRow(item))
          nextCursor = result.value.nextCursor
        }
        sections[status] = {
          items: dedupeById(rows).map((row) => ({
            ...row,
            key: createdKeys.get(row.ticket.id) ?? row.key
          })),
          nextCursor
        }
      }

      // A failed or unmounted page must not fail the region, so this cannot be
      // `AsyncResult.all` over the pages. Waiting is the union across parts.
      return AsyncResult.success<BacklogValue>(
        { counts: base.value.counts, sections },
        { waiting: parts.some((part) => part.waiting) }
      )
    },
    (refresh) => refresh(sectionsQuery(req))
  )

/** The value every backlog consumer reads. */
export const backlog = Atom.family((req: BacklogRequest) =>
  Atom.optimistic(backlogView(req))
)

export const loadMoreBacklog = Atom.family(
  ({
    req,
    status
  }: Readonly<{
    req: BacklogRequest
    status: string
  }>) =>
    Api.runtime.fn(
      Effect.fn("loadMoreBacklog")(function* (
        _input: void,
        get: Atom.FnContext
      ) {
        const current = get(backlog(req))
        if (!AsyncResult.isSuccess(current)) return yield* Effect.void
        const cursor = current.value.sections[status]?.nextCursor
        if (!cursor) return yield* Effect.void
        const loaded = get(loadedPagesAtom(req))
        const depth = loaded[status] ?? 0
        const base = get(sectionsQuery(req))
        if (!AsyncResult.isSuccess(base)) return yield* Effect.void
        let pageCursor: string | null =
          base.value.sections[status as TicketStatus]?.nextCursor ?? null
        for (let index = 0; index < depth; index++) {
          if (pageCursor === null) break
          const page = pageQuery(req, status, pageCursor)
          if (pageCursor === cursor) {
            return yield* Effect.callback<
              unknown,
              NotFound | Forbidden | Unauthorized
            >((resume) => {
              let cancel: (() => void) | undefined
              cancel = get.registry.subscribe(
                page,
                (result) => {
                  if (AsyncResult.isSuccess(result) && !result.waiting) {
                    cancel?.()
                    resume(Effect.succeed(result.value))
                  } else if (AsyncResult.isFailure(result) && !result.waiting) {
                    cancel?.()
                    resume(Effect.failCause(result.cause))
                  }
                },
                { immediate: false }
              )
              get.refresh(page)
              return Effect.sync(() => cancel?.())
            })
          }
          const result = get(page)
          if (!AsyncResult.isSuccess(result)) return yield* Effect.void
          pageCursor = result.value.nextCursor
        }
        get.set(loadedPagesAtom(req), { ...loaded, [status]: depth + 1 })
        return yield* get.result(pageQuery(req, status, cursor), {
          suspendOnWaiting: true
        })
      })
    )
)

const insertByOrderKey = (
  items: ReadonlyArray<BacklogRow>,
  row: BacklogRow,
  dir: TicketSort["dir"]
): ReadonlyArray<BacklogRow> => {
  const orderKey = row.orderKey
  if (orderKey === null) return [row, ...items]
  let low = 0
  let high = items.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const candidate = items[middle].orderKey
    const sortsBefore =
      candidate === null ||
      (dir === "asc"
        ? compareCodePoints(candidate, orderKey) < 0
        : compareCodePoints(candidate, orderKey) > 0)
    if (sortsBefore) low = middle + 1
    else high = middle
  }
  return [...items.slice(0, low), row, ...items.slice(low)]
}

const patchesSortedField = (
  patch: UpdateTicketInput,
  key: TicketSort["key"]
): boolean => {
  if (key === "title") return patch.title !== undefined
  if (key === "priority") return patch.priority !== undefined
  return false
}

const localOrderKey = (ticket: Ticket, sort: TicketSort): string => {
  let value: string
  switch (sort.key) {
    case "id":
      value = padNumericIdSort(ticket.id) ?? ticket.id
      break
    case "created":
      value = ticket.createdAt.toISOString()
      break
    case "updated":
      value = ticket.updatedAt.toISOString()
      break
    case "title":
      value = ticket.title.toLowerCase()
      break
    case "priority":
      value = String(PRIORITY_META[ticket.priority].ordinal + 1).padStart(
        2,
        "0"
      )
      break
  }
  return `${value}\u0000${ticket.id}`
}

const patchRow = (
  value: BacklogValue,
  id: TicketId,
  patch: UpdateTicketInput,
  sort: TicketSort,
  now: Date
): BacklogValue => {
  let patched: BacklogRow | undefined
  let from: TicketStatus | undefined
  const sections: Record<string, BacklogSection> = {}

  for (const [status, section] of Object.entries(value.sections)) {
    const items: Array<BacklogRow> = []
    for (const row of section.items) {
      if (row.ticket.id !== id) {
        items.push(row)
        continue
      }
      patched = {
        ...row,
        ticket: { ...applyTicketPatch(row.ticket, patch), updatedAt: now }
      }
      if (sort.key === "updated" || patchesSortedField(patch, sort.key)) {
        patched = { ...patched, orderKey: localOrderKey(patched.ticket, sort) }
      }
      from = status as TicketStatus
    }
    sections[status] = { ...section, items }
  }

  if (!patched || from === undefined) return { ...value, sections }

  const to = patch.status ?? from
  const target = sections[to] ?? { items: [], nextCursor: null }
  sections[to] = {
    ...target,
    items: insertByOrderKey(target.items, patched, sort.dir)
  }

  if (to === from) return { ...value, sections }

  const byStatus = { ...value.counts.byStatus }
  byStatus[from] = Math.max(0, (byStatus[from] ?? 0) - 1)
  byStatus[to] = (byStatus[to] ?? 0) + 1

  return { counts: { total: value.counts.total, byStatus }, sections }
}

const replaceRow = (
  value: BacklogValue,
  ticket: Ticket,
  orderKey: string | null,
  sort: TicketSort
): BacklogValue => {
  const sections: Record<string, BacklogSection> = {}
  for (const [status, section] of Object.entries(value.sections)) {
    if (orderKey === null) {
      sections[status] = {
        ...section,
        items: section.items.map((row) =>
          row.ticket.id === ticket.id ? { ...row, ticket } : row
        )
      }
      continue
    }
    const items: Array<BacklogRow> = []
    let moved: BacklogRow | undefined
    for (const row of section.items) {
      if (row.ticket.id === ticket.id) moved = { ...row, ticket, orderKey }
      else items.push(row)
    }
    sections[status] = {
      ...section,
      items:
        moved === undefined ? items : insertByOrderKey(items, moved, sort.dir)
    }
  }
  return { ...value, sections }
}

const unsavedPatchAtom = Atom.family(
  (_key: Readonly<{ req: BacklogRequest; id: TicketId }>) =>
    Atom.make<UpdateTicketInput>({}).pipe(Atom.setIdleTTL("2 minutes"))
)

export const updateBacklogTicket = Atom.family(
  ({ req, id }: Readonly<{ req: BacklogRequest; id: TicketId }>) =>
    Atom.optimisticFn(backlog(req), {
      reducer: (current, patch: UpdateTicketInput) =>
        AsyncResult.map(current, (value) =>
          patchRow(
            value,
            id,
            patch,
            req.query.sort,
            DateTime.toDate(DateTime.nowUnsafe())
          )
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("updateBacklogTicket")(function* (
            patch: UpdateTicketInput,
            get
          ) {
            const unsaved = unsavedPatchAtom({ req, id })
            const payload: UpdateTicketInput = { ...get(unsaved), ...patch }
            get.set(unsaved, payload)
            const { ticket: updated, orderKey } = yield* Effect.catchCause(
              Api.use((client) =>
                client.tickets.update({
                  params: { ...req.params, id },
                  query: { sort: req.query.sort },
                  payload
                })
              ),
              (cause) => {
                if (
                  !Cause.hasInterruptsOnly(cause) &&
                  get(unsaved) === payload
                ) {
                  get.set(unsaved, {})
                }
                return Effect.failCause(cause)
              }
            )
            set(
              AsyncResult.map(get(backlog(req)), (value) =>
                replaceRow(value, updated, orderKey, req.query.sort)
              )
            )
            yield* Reactivity.invalidate([
              Keys.ticketsIn(scopeOf(req)),
              Keys.ticket(scopeOf(req), id),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req))
            ])
            if (get(unsaved) === payload) get.set(unsaved, {})
            return updated
          })
        )
    })
)

/**
 * Maps a server ticket id to the client key its row was created with, so the
 * row keeps its React identity when the optimistic placeholder is replaced by
 * the real ticket. View state, not cache.
 */
const createdKeysAtom = Atom.family((_scope: string) =>
  Atom.make<ReadonlyMap<TicketId, string>>(new Map()).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

export type QuickCreatePrediction = Readonly<{
  priority: TicketPriority | null
  tags: ReadonlyArray<TagName>
}>

export type QuickCreateArg = Readonly<{
  ticket: QuickCreateTicketInput
  viewerId: string
  projectPrefix: string
  clientId: string
  prediction?: QuickCreatePrediction
}>

const placeholderId = (
  taken: ReadonlyArray<BacklogRow>,
  prefix: string
): TicketId => {
  const used = new Set(taken.map((row) => row.ticket.id))
  let n = 999999
  while (used.has(`${prefix}-${n}` as TicketId)) n++
  return `${prefix}-${n}` as TicketId
}

export const predictedTicket = (
  input: QuickCreateArg,
  id: TicketId,
  status: TicketStatus
): Ticket => {
  const now = DateTime.toDate(DateTime.nowUnsafe())
  return {
    id,
    title: input.ticket.title,
    status,
    type: input.ticket.type ?? "other",
    priority: input.prediction?.priority ?? "med",
    tags: input.prediction?.tags ?? [],
    branch: null,
    pr: null,
    prState: null,
    lastTransitionedPr: null,
    gitState: { tag: "no_branch", baseBranch: "" },
    assignees: [],
    archivedAt: null,
    createdBy: input.viewerId,
    createdAt: now,
    updatedAt: now
  }
}

export const quickCreateBacklogTicket = Atom.family((req: BacklogRequest) =>
  Atom.optimisticFn(backlog(req), {
    reducer: (current, input: QuickCreateArg) =>
      AsyncResult.map(current, (value) => {
        const status = input.ticket.status ?? ("todo" as TicketStatus)
        const section = value.sections[status] ?? {
          items: [],
          nextCursor: null
        }
        const predicted = predictedTicket(
          input,

          placeholderId(section.items, input.projectPrefix),

          status
        )
        if (
          !matchesTicketQuery(
            predicted,
            { ...req.query, status: undefined },
            undefined
          ) ||
          (req.query.groupId?.length &&
            !req.query.groupId.includes("ungrouped"))
        )
          return value
        return {
          counts: {
            total: value.counts.total + 1,
            byStatus: {
              ...value.counts.byStatus,
              [status]: (value.counts.byStatus[status] ?? 0) + 1
            }
          },
          sections: {
            ...value.sections,
            [status]: {
              ...section,
              items: [
                {
                  ticket: predicted,
                  key: input.clientId,
                  orderKey: null,
                  pending: true
                },
                ...section.items
              ]
            }
          }
        }
      }),
    fn: Api.runtime.fn(
      Effect.fn("quickCreateBacklogTicket")(function* (
        input: QuickCreateArg,
        get
      ) {
        const created = yield* Api.use((client) =>
          client.tickets.quickCreate({
            params: req.params,
            payload: input.ticket
          })
        )
        const index = createdKeysAtom(scopeOf(req))
        get.set(index, new Map(get(index)).set(created.id, input.clientId))
        yield* Reactivity.invalidate([
          Keys.ticketsIn(scopeOf(req)),
          Keys.ticketLists(scopeOf(req)),
          Keys.ticketPages(scopeOf(req))
        ])
        return created
      })
    )
  })
)

export const flatBacklogRequest = (
  orgSlug: string,
  slug: string,
  query: QueryWithView
): BacklogRequest => ({
  params: { orgSlug, slug },
  query: { ...ticketListQueryOf(query), cursor: undefined }
})

export type FlatBacklogValue = Readonly<{
  items: ReadonlyArray<BacklogRow>
  nextCursor: string | null
  count: number
}>

const emptyFlatBacklog = (): FlatBacklogValue => ({
  items: [],
  nextCursor: null,
  count: 0
})

const countQueryOf = (req: BacklogRequest) => {
  const { sort: _sort, cursor: _cursor, ...query } = req.query
  return ticketCounts(countsRequest(req.params.orgSlug, req.params.slug, query))
}

const flatFirstPageQuery = (req: BacklogRequest) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.ticketPages(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const flatPageQuery = (req: BacklogRequest, cursor: string) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: { ...req.query, cursor },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.ticketPages(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const flatLoadedPagesAtom = Atom.family((_req: BacklogRequest) =>
  Atom.make(0).pipe(Atom.setIdleTTL("2 minutes"))
)

const assignedSprintId = (req: BacklogRequest): GroupId | undefined => {
  const id = req.query.groupId?.[0]
  return id !== undefined && id !== "ungrouped" ? id : undefined
}

const flatBacklogView = (req: BacklogRequest) =>
  Atom.readable(
    (get) => {
      const page = get(flatFirstPageQuery(req))
      const counts = get(countQueryOf(req))
      if (!AsyncResult.isSuccess(page) || !AsyncResult.isSuccess(counts)) {
        const combined = AsyncResult.all([page, counts])
        return AsyncResult.map(combined, emptyFlatBacklog)
      }
      const createdKeys = get(createdKeysAtom(scopeOf(req)))
      const rows: Array<BacklogRow> = page.value.items.map(toRow)
      let nextCursor = page.value.nextCursor
      const parts: Array<AsyncResult.AsyncResult<unknown, unknown>> = [
        page,
        counts
      ]
      const depth = get(flatLoadedPagesAtom(req))
      for (let index = 0; index < depth; index++) {
        if (nextCursor === null) break
        const cursor = nextCursor
        const extra = get(flatPageQuery(req, cursor))
        parts.push(extra)
        if (!AsyncResult.isSuccess(extra)) break
        for (const item of extra.value.items) rows.push(toRow(item))
        nextCursor = extra.value.nextCursor
      }
      return AsyncResult.success<FlatBacklogValue>(
        {
          items: dedupeById(rows).map((row) => ({
            ...row,
            key: createdKeys.get(row.ticket.id) ?? row.key
          })),
          nextCursor,
          count: counts.value.total
        },
        { waiting: parts.some((part) => part.waiting) }
      )
    },
    (refresh) => {
      refresh(flatFirstPageQuery(req))
      refresh(countQueryOf(req))
    }
  )

export const flatBacklog = Atom.family((req: BacklogRequest) =>
  Atom.optimistic(flatBacklogView(req))
)

export const loadMoreFlatBacklog = Atom.family((req: BacklogRequest) =>
  Api.runtime.fn(
    Effect.fn("loadMoreFlatBacklog")(function* (
      _input: void,
      get: Atom.FnContext
    ) {
      const current = get(flatBacklog(req))
      if (!AsyncResult.isSuccess(current)) return yield* Effect.void
      const cursor = current.value.nextCursor
      if (!cursor) return yield* Effect.void
      const depth = get(flatLoadedPagesAtom(req))
      const first = get(flatFirstPageQuery(req))
      if (!AsyncResult.isSuccess(first)) return yield* Effect.void
      let pageCursor: string | null = first.value.nextCursor
      for (let index = 0; index < depth; index++) {
        if (pageCursor === null) break
        const page = flatPageQuery(req, pageCursor)
        if (pageCursor === cursor) {
          return yield* Effect.callback<
            unknown,
            NotFound | Forbidden | Unauthorized
          >((resume) => {
            let cancel: (() => void) | undefined
            cancel = get.registry.subscribe(
              page,
              (result) => {
                if (AsyncResult.isSuccess(result) && !result.waiting) {
                  cancel?.()
                  resume(Effect.succeed(result.value))
                } else if (AsyncResult.isFailure(result) && !result.waiting) {
                  cancel?.()
                  resume(Effect.failCause(result.cause))
                }
              },
              { immediate: false }
            )
            get.refresh(page)
            return Effect.sync(() => cancel?.())
          })
        }
        const result = get(page)
        if (!AsyncResult.isSuccess(result)) return yield* Effect.void
        pageCursor = result.value.nextCursor
      }
      get.set(flatLoadedPagesAtom(req), depth + 1)
      return yield* get.result(flatPageQuery(req, cursor), {
        suspendOnWaiting: true
      })
    })
  )
)

const unsavedFlatPatchAtom = Atom.family(
  (_key: Readonly<{ req: BacklogRequest; id: TicketId }>) =>
    Atom.make<UpdateTicketInput>({}).pipe(Atom.setIdleTTL("2 minutes"))
)

const patchFlatRow = (
  value: FlatBacklogValue,
  id: TicketId,
  patch: UpdateTicketInput,
  sort: TicketSort,
  now: Date
): FlatBacklogValue => {
  let patched: BacklogRow | undefined
  const items: Array<BacklogRow> = []
  for (const row of value.items) {
    if (row.ticket.id !== id) {
      items.push(row)
      continue
    }
    patched = {
      ...row,
      ticket: { ...applyTicketPatch(row.ticket, patch), updatedAt: now },
      pending: true
    }
    if (sort.key === "updated" || patchesSortedField(patch, sort.key)) {
      patched = { ...patched, orderKey: localOrderKey(patched.ticket, sort) }
    }
  }
  if (!patched) return value
  return {
    ...value,
    items: insertByOrderKey(items, patched, sort.dir)
  }
}

const replaceFlatRow = (
  value: FlatBacklogValue,
  ticket: Ticket,
  orderKey: string | null,
  sort: TicketSort
): FlatBacklogValue => {
  if (orderKey === null) {
    return {
      ...value,
      items: value.items.map((row) =>
        row.ticket.id === ticket.id ? { ...row, ticket, pending: false } : row
      )
    }
  }
  const items: Array<BacklogRow> = []
  let moved: BacklogRow | undefined
  for (const row of value.items) {
    if (row.ticket.id === ticket.id) {
      moved = { ...row, ticket, orderKey, pending: false }
    } else items.push(row)
  }
  if (moved === undefined) return value
  return {
    ...value,
    items: insertByOrderKey(items, moved, sort.dir)
  }
}

export const updateFlatBacklogTicket = Atom.family(
  ({ req, id }: Readonly<{ req: BacklogRequest; id: TicketId }>) =>
    Atom.optimisticFn(flatBacklog(req), {
      reducer: (current, patch: UpdateTicketInput) =>
        AsyncResult.map(current, (value) =>
          patchFlatRow(
            value,
            id,
            patch,
            req.query.sort,
            DateTime.toDate(DateTime.nowUnsafe())
          )
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("updateFlatBacklogTicket")(function* (
            patch: UpdateTicketInput,
            get
          ) {
            const unsaved = unsavedFlatPatchAtom({ req, id })
            const payload: UpdateTicketInput = { ...get(unsaved), ...patch }
            get.set(unsaved, payload)
            const { ticket: updated, orderKey } = yield* Effect.catchCause(
              Api.use((client) =>
                client.tickets.update({
                  params: { ...req.params, id },
                  query: { sort: req.query.sort },
                  payload
                })
              ),
              (cause) => {
                if (
                  !Cause.hasInterruptsOnly(cause) &&
                  get(unsaved) === payload
                ) {
                  get.set(unsaved, {})
                }
                return Effect.failCause(cause)
              }
            )
            set(
              AsyncResult.map(get(flatBacklog(req)), (value) =>
                replaceFlatRow(value, updated, orderKey, req.query.sort)
              )
            )
            yield* Reactivity.invalidate([
              Keys.ticketsIn(scopeOf(req)),
              Keys.ticket(scopeOf(req), id),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req))
            ])
            if (get(unsaved) === payload) get.set(unsaved, {})
            return updated
          })
        )
    })
)

export const quickCreateFlatBacklogTicket = Atom.family((req: BacklogRequest) =>
  Atom.optimisticFn(flatBacklog(req), {
    reducer: (current, input: QuickCreateArg) =>
      AsyncResult.map(current, (value) => {
        const status = input.ticket.status ?? ("todo" as TicketStatus)
        const predicted = predictedTicket(
          input,

          placeholderId(value.items, input.projectPrefix),

          status
        )
        return {
          count: value.count + 1,
          nextCursor: value.nextCursor,
          items: [
            {
              ticket: predicted,
              key: input.clientId,
              orderKey: null,
              pending: true
            },
            ...value.items
          ]
        }
      }),
    fn: (set) =>
      Api.runtime.fn(
        Effect.fn("quickCreateFlatBacklogTicket")(function* (
          input: QuickCreateArg,
          get
        ) {
          const created = yield* Api.use((client) =>
            client.tickets.quickCreate({
              params: req.params,
              payload: input.ticket
            })
          )
          const groupId = assignedSprintId(req)
          const assignment = yield* Effect.exit(
            groupId
              ? Api.use((client) =>
                  client.groups.addTickets({
                    params: { ...req.params, id: groupId },
                    payload: { tickets: [created.id] }
                  })
                )
              : Effect.void
          )
          const index = createdKeysAtom(scopeOf(req))
          get.set(index, new Map(get(index)).set(created.id, input.clientId))
          set(
            AsyncResult.map(get(flatBacklog(req)), (value) => ({
              ...value,
              items: value.items.map((row) =>
                row.key === input.clientId
                  ? {
                      ticket: created,
                      key: row.key,
                      orderKey: row.orderKey,
                      pending: false
                    }
                  : row
              )
            }))
          )
          yield* Reactivity.invalidate([
            Keys.ticketsIn(scopeOf(req)),
            Keys.ticketLists(scopeOf(req)),
            Keys.ticketPages(scopeOf(req)),
            Keys.sprints(scopeOf(req)),
            Keys.sprintMembership(scopeOf(req))
          ])
          return {
            ...created,
            sprintAssignmentFailed: Exit.isFailure(assignment)
          }
        })
      )
  })
)
