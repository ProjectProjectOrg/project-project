import * as DateTime from "effect/DateTime"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import {
  padNumericIdSort,
  SPRINT_SECTION_UNSCHEDULED,
  type GroupId,
  type GroupIdFilter,
  type NotFound,
  type SprintSectionKey,
  type Ticket,
  type TicketId,
  type TicketListQuery,
  type TicketListRow,
  type TicketSort,
  type TicketStatus,
  type Unauthorized,
  type UpdateTicketInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { compareCodePoints } from "@/lib/orderKey"
import { PRIORITY_META } from "@/lib/priority-meta"
import { applyTicketPatch } from "./ticketPatch"
import {
  type BacklogRequest,
  type BacklogRow,
  type BacklogSection,
  type QuickCreateArg
} from "./backlog"

type QueryWithView = TicketListQuery & Readonly<{ view?: unknown }>

const ticketListQueryOf = (query: QueryWithView): TicketListQuery => {
  const { view: _view, ...rest } = query
  return rest
}

export const sprintSectionsRequest = (
  orgSlug: string,
  slug: string,
  query: QueryWithView
): BacklogRequest => ({
  params: { orgSlug, slug },
  query: {
    ...ticketListQueryOf(query),
    groupId: undefined,
    cursor: undefined
  }
})

const scopeOf = (req: BacklogRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export type SprintSectionValue = Readonly<{
  key: SprintSectionKey
  count: number
  page: BacklogSection
}>

export type SprintSectionsValue = Readonly<{
  total: number
  sections: ReadonlyArray<SprintSectionValue>
}>

const toRow = (row: TicketListRow): BacklogRow => ({
  ticket: row.ticket,
  key: row.ticket.id,
  orderKey: row.orderKey,
  pending: false
})

const groupIdFilter = (key: SprintSectionKey): GroupIdFilter =>
  key === SPRINT_SECTION_UNSCHEDULED ? "ungrouped" : key

const snapshotQuery = (req: BacklogRequest) =>
  Api.query("tickets", "sprintSections", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.sprints(scopeOf(req)),
      Keys.sprintMembership(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const loadedPagesAtom = Atom.family((_req: BacklogRequest) =>
  Atom.make<Readonly<Record<string, number>>>({}).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

const pageQuery = (req: BacklogRequest, key: SprintSectionKey, cursor: string) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: {
      ...req.query,
      groupId: [groupIdFilter(key)],
      cursor
    },
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

const emptySprintSections = (): SprintSectionsValue => ({
  total: 0,
  sections: []
})

const createdKeysAtom = Atom.family((_scope: string) =>
  Atom.make<ReadonlyMap<TicketId, string>>(new Map()).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

const sprintSectionsView = (req: BacklogRequest) =>
  Atom.readable(
    (get) => {
      const base = get(snapshotQuery(req))
      if (!AsyncResult.isSuccess(base)) {
        return AsyncResult.map(base, emptySprintSections)
      }
      const loaded = get(loadedPagesAtom(req))
      const createdKeys = get(createdKeysAtom(scopeOf(req)))
      const parts: Array<AsyncResult.AsyncResult<unknown, unknown>> = [base]
      const sections = base.value.sections.map((section) => {
        const rows: Array<BacklogRow> = section.page.items.map(toRow)
        let nextCursor = section.page.nextCursor
        const depth = loaded[section.key] ?? 0
        for (let index = 0; index < depth; index++) {
          if (nextCursor === null) break
          const cursor = nextCursor
          const result = get(pageQuery(req, section.key, cursor))
          parts.push(result)
          if (!AsyncResult.isSuccess(result)) break
          for (const item of result.value.items) rows.push(toRow(item))
          nextCursor = result.value.nextCursor
        }
        return {
          key: section.key,
          count: section.count,
          page: {
            items: dedupeById(rows).map((row) => ({
              ...row,
              key: createdKeys.get(row.ticket.id) ?? row.key
            })),
            nextCursor
          }
        }
      })
      return AsyncResult.success<SprintSectionsValue>(
        { total: base.value.total, sections },
        { waiting: parts.some((part) => part.waiting) }
      )
    },
    (refresh) => refresh(snapshotQuery(req))
  )

export const sprintSections = Atom.family((req: BacklogRequest) =>
  Atom.optimistic(sprintSectionsView(req))
)

export const loadMoreSprintSections = Atom.family(
  ({
    req,
    key
  }: Readonly<{
    req: BacklogRequest
    key: SprintSectionKey
  }>) =>
    Api.runtime.fn(
      Effect.fn("loadMoreSprintSections")(function* (
        _input: void,
        get: Atom.FnContext
      ) {
        const current = get(sprintSections(req))
        if (!AsyncResult.isSuccess(current)) return yield* Effect.void
        const cursor = current.value.sections.find(
          (section) => section.key === key
        )?.page.nextCursor
        if (!cursor) return yield* Effect.void
        const loaded = get(loadedPagesAtom(req))
        const depth = loaded[key] ?? 0
        const base = get(snapshotQuery(req))
        if (!AsyncResult.isSuccess(base)) return yield* Effect.void
        let pageCursor: string | null =
          base.value.sections.find((section) => section.key === key)?.page
            .nextCursor ?? null
        for (let index = 0; index < depth; index++) {
          if (pageCursor === null) break
          const page = pageQuery(req, key, pageCursor)
          if (pageCursor === cursor) {
            return yield* Effect.callback<unknown, NotFound | Unauthorized>(
              (resume) => {
                let cancel: (() => void) | undefined
                cancel = get.registry.subscribe(
                  page,
                  (result) => {
                    if (AsyncResult.isSuccess(result) && !result.waiting) {
                      cancel?.()
                      resume(Effect.succeed(result.value))
                    } else if (
                      AsyncResult.isFailure(result) &&
                      !result.waiting
                    ) {
                      cancel?.()
                      resume(Effect.failCause(result.cause))
                    }
                  },
                  { immediate: false }
                )
                get.refresh(page)
                return Effect.sync(() => cancel?.())
              }
            )
          }
          const result = get(page)
          if (!AsyncResult.isSuccess(result)) return yield* Effect.void
          pageCursor = result.value.nextCursor
        }
        get.set(loadedPagesAtom(req), { ...loaded, [key]: depth + 1 })
        return yield* get.result(pageQuery(req, key, cursor), {
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
    const candidate = items[middle]!.orderKey
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
  value: SprintSectionsValue,
  id: TicketId,
  patch: UpdateTicketInput,
  sort: TicketSort,
  now: Date
): SprintSectionsValue => {
  let patched: BacklogRow | undefined
  const sections = value.sections.map((section) => {
    const items: Array<BacklogRow> = []
    let found: BacklogRow | undefined
    for (const row of section.page.items) {
      if (row.ticket.id !== id) {
        items.push(row)
        continue
      }
      found = {
        ...row,
        ticket: { ...applyTicketPatch(row.ticket, patch), updatedAt: now },
        pending: true
      }
      if (sort.key === "updated" || patchesSortedField(patch, sort.key)) {
        found = { ...found, orderKey: localOrderKey(found.ticket, sort) }
      }
      patched = found
    }
    if (found === undefined) return section
    return {
      ...section,
      page: {
        ...section.page,
        items: insertByOrderKey(items, found, sort.dir)
      }
    }
  })
  if (!patched) return value
  return { ...value, sections }
}

const replaceRow = (
  value: SprintSectionsValue,
  ticket: Ticket,
  orderKey: string | null,
  sort: TicketSort
): SprintSectionsValue => ({
  ...value,
  sections: value.sections.map((section) => {
    if (orderKey === null) {
      return {
        ...section,
        page: {
          ...section.page,
          items: section.page.items.map((row) =>
            row.ticket.id === ticket.id
              ? { ...row, ticket, pending: false }
              : row
          )
        }
      }
    }
    const items: Array<BacklogRow> = []
    let moved: BacklogRow | undefined
    for (const row of section.page.items) {
      if (row.ticket.id === ticket.id)
        moved = { ...row, ticket, orderKey, pending: false }
      else items.push(row)
    }
    if (moved === undefined) return section
    return {
      ...section,
      page: {
        ...section.page,
        items: insertByOrderKey(items, moved, sort.dir)
      }
    }
  })
})

const unsavedPatchAtom = Atom.family(
  (_key: Readonly<{ req: BacklogRequest; id: TicketId }>) =>
    Atom.make<UpdateTicketInput>({}).pipe(Atom.setIdleTTL("2 minutes"))
)

export const updateSprintSectionsTicket = Atom.family(
  ({ req, id }: Readonly<{ req: BacklogRequest; id: TicketId }>) =>
    Atom.optimisticFn(sprintSections(req), {
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
          Effect.fn("updateSprintSectionsTicket")(function* (
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
              AsyncResult.map(get(sprintSections(req)), (value) =>
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

const placeholderId = (
  taken: ReadonlyArray<BacklogRow>,
  prefix: string
): TicketId => {
  const used = new Set(taken.map((row) => row.ticket.id))
  let n = 999999
  while (used.has(`${prefix}-${n}` as TicketId)) n++
  return `${prefix}-${n}` as TicketId
}

const assignedSprintId = (key: SprintSectionKey): GroupId | undefined =>
  key === SPRINT_SECTION_UNSCHEDULED ? undefined : key

export const quickCreateSprintSectionsTicket = Atom.family(
  ({
    req,
    key
  }: Readonly<{
    req: BacklogRequest
    key: SprintSectionKey
  }>) =>
    Atom.optimisticFn(sprintSections(req), {
      reducer: (current, input: QuickCreateArg) =>
        AsyncResult.map(current, (value) => {
          const existing = value.sections.find((section) => section.key === key)
          const page = existing?.page ?? { items: [], nextCursor: null }
          const status = input.ticket.status ?? ("todo" as TicketStatus)
          const now = DateTime.toDate(DateTime.nowUnsafe())
          const predicted: Ticket = {
            id: placeholderId(page.items, input.projectPrefix),
            title: input.ticket.title,
            status,
            type: input.ticket.type ?? "other",
            priority: "med",
            tags: [],
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
          const nextSection: SprintSectionValue = {
            key,
            count: (existing?.count ?? 0) + 1,
            page: {
              ...page,
              items: [
                {
                  ticket: predicted,
                  key: input.clientId,
                  orderKey: null,
                  pending: true
                },
                ...page.items
              ]
            }
          }
          return {
            total: value.total + 1,
            sections: existing
              ? value.sections.map((section) =>
                  section.key === key ? nextSection : section
                )
              : [nextSection, ...value.sections]
          }
        }),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("quickCreateSprintSectionsTicket")(function* (
            input: QuickCreateArg,
            get
          ) {
            const created = yield* Api.use((client) =>
              client.tickets.quickCreate({
                params: req.params,
                payload: input.ticket
              })
            )
            const groupId = assignedSprintId(key)
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
              AsyncResult.map(get(sprintSections(req)), (value) => ({
                ...value,
                sections: value.sections.map((section) =>
                  section.key !== key
                    ? section
                    : {
                        ...section,
                        page: {
                          ...section.page,
                          items: section.page.items.map((row) =>
                            row.key === input.clientId
                              ? {
                                  ticket: created,
                                  key: row.key,
                                  orderKey: row.orderKey,
                                  pending: false
                                }
                              : row
                          )
                        }
                      }
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

