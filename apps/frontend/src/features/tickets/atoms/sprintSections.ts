import {
  matchesTicketQuery,
  SPRINT_SECTION_UNSCHEDULED,
  type GroupId,
  type GroupIdFilter,
  type SprintSectionKey,
  type TicketId,
  type TicketListQuery,
  type TicketListRow,
  type TicketStatus,
  type UpdateTicketInput,
  type UserId
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

import {
  type BacklogRequest,
  type BacklogRow,
  predictedTicket,
  type QuickCreateArg,
  withoutEpicsByDefault
} from "./backlog"
import {
  dedupeById,
  loadMoreSection,
  patchSectionsRow,
  replaceSectionsRow,
  type SectionsValue,
  type SectionValue
} from "./sectionRows"

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
    ...withoutEpicsByDefault(ticketListQueryOf(query)),
    cursor: undefined
  }
})

const scopeOf = (req: BacklogRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export type SprintSectionValue = SectionValue<SprintSectionKey>

export type SprintSectionsValue = SectionsValue<SprintSectionValue>

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

const pageQuery = (
  req: BacklogRequest,
  key: SprintSectionKey,
  cursor: string
) =>
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

const emptySprintSections = (): SprintSectionsValue => ({
  total: 0,
  counts: { total: 0, byStatus: {} },
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
        { total: base.value.total, counts: base.value.counts, sections },
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
        return yield* loadMoreSection(get, {
          key,
          sections: sprintSections(req),
          snapshot: snapshotQuery(req),
          loadedPages: loadedPagesAtom(req),
          pageQuery: (cursor) => pageQuery(req, key, cursor)
        })
      })
    )
)

const unsavedPatchAtom = Atom.family(
  (_key: Readonly<{ req: BacklogRequest; id: TicketId }>) =>
    Atom.make<UpdateTicketInput>({}).pipe(Atom.setIdleTTL("2 minutes"))
)

export const updateSprintSectionsTicket = Atom.family(
  ({
    req,
    id,
    viewerId
  }: Readonly<{
    req: BacklogRequest
    id: TicketId
    viewerId: UserId | undefined
  }>) =>
    Atom.optimisticFn(sprintSections(req), {
      reducer: (current, patch: UpdateTicketInput) =>
        AsyncResult.map(current, (value) =>
          patchSectionsRow(
            value,
            id,
            patch,
            req.query,
            viewerId,
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
                replaceSectionsRow(value, updated, orderKey, req.query.sort)
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
          const predicted = predictedTicket(
            input,
            placeholderId(page.items, input.projectPrefix),
            status
          )
          if (
            !matchesTicketQuery(
              predicted,
              { ...req.query, status: undefined },
              undefined
            )
          )
            return value
          const isVisible =
            !req.query.status?.length || req.query.status.includes(status)
          const counts = {
            total: value.counts.total + 1,
            byStatus: {
              ...value.counts.byStatus,
              [status]: (value.counts.byStatus[status] ?? 0) + 1
            }
          }
          if (!isVisible) return { ...value, counts }
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
            counts,
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
