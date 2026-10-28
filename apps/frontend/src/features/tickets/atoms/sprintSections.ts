import {
  matchesTicketQuery,
  SPRINT_SECTION_UNSCHEDULED,
  finishedStatusSlugs,
  summarizeEstimates,
  type EstimateSummary,
  type EstimationMode,
  type GroupId,
  type GroupIdFilter,
  type SprintSectionKey,
  type Ticket,
  type TicketCounts,
  type TicketId,
  type TicketListQuery,
  type TicketSort,
  TicketStatus,
  type UpdateTicketInput,
  type UserId
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { bindRowMutation, viewMutation } from "@/api/viewMutation"
import { currentUserId } from "@/features/auth/atoms/auth"
import {
  projectEstimation,
  projectRequest
} from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  createInSprint,
  sprintAssignmentKeys
} from "@/features/sprints/atoms/sprintList"
import {
  insertByOrderKey,
  patchTicketRow,
  placeholderRow,
  toRow,
  withCreatedKeys,
  type QueryWithView,
  type QuickCreateInput,
  type TicketRow,
  type TicketRowPage,
  viewQuery
} from "@/features/tickets/lib/ticketRows"

import {
  coalescingTicketUpdate,
  createdKeys,
  loadNextPage,
  readLoadedPages,
  recordCreatedKey
} from "./ticketRows"

export type SprintSectionsRequest = Readonly<{
  _view: "sprintSections"
  params: Readonly<{ orgSlug: string; slug: string }>
  query: TicketListQuery
}>

export const sprintSectionsRequest = (
  orgSlug: string,
  slug: string,
  query: QueryWithView
): SprintSectionsRequest => ({
  _view: "sprintSections",
  params: { orgSlug, slug },
  query: {
    ...viewQuery(query),
    cursor: undefined
  }
})

const scopeOf = (req: SprintSectionsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export type SprintSectionValue = Readonly<{
  key: SprintSectionKey
  count: number
  estimates: EstimateSummary | null
  page: TicketRowPage
}>

export type SprintSectionsValue = Readonly<{
  total: number
  counts: TicketCounts
  sections: ReadonlyArray<SprintSectionValue>
  viewer: Readonly<{
    id: UserId | undefined
    estimation: EstimationMode
    finished: ReadonlySet<string>
  }>
}>

const groupIdFilter = (key: SprintSectionKey): GroupIdFilter =>
  key === SPRINT_SECTION_UNSCHEDULED ? "ungrouped" : key

const snapshotQuery = (req: SprintSectionsRequest) =>
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

const loadedPagesAtom = Atom.family((_req: SprintSectionsRequest) =>
  Atom.make<Readonly<Record<string, number>>>({}).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

const pageQuery = (
  req: SprintSectionsRequest,
  key: SprintSectionKey,
  cursor: string
) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: {
      ...req.query,
      section: { groupId: [groupIdFilter(key)] },
      cursor
    },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.ticketPages(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const viewerOf = (get: Atom.AtomContext, req: SprintSectionsRequest) => {
  const statuses = get(
    statusesFor(statusesRequest(req.params.orgSlug, req.params.slug))
  )
  return {
    id: get(currentUserId),
    estimation: get(
      projectEstimation(projectRequest(req.params.orgSlug, req.params.slug))
    ),
    finished: finishedStatusSlugs(
      AsyncResult.isSuccess(statuses) ? statuses.value : []
    )
  }
}

const emptySprintSections = (
  viewer: SprintSectionsValue["viewer"]
): SprintSectionsValue => ({
  total: 0,
  counts: { total: 0, byStatus: {} },
  sections: [],
  viewer
})

const sprintSectionsView = (req: SprintSectionsRequest) =>
  Atom.readable(
    (get) => {
      const base = get(snapshotQuery(req))
      const viewer = viewerOf(get, req)
      if (!AsyncResult.isSuccess(base)) {
        return AsyncResult.map(base, () => emptySprintSections(viewer))
      }
      const loaded = get(loadedPagesAtom(req))
      const created = get(createdKeys(scopeOf(req)))
      let waiting = base.waiting
      const sections = base.value.sections.map((section) => {
        const pages = readLoadedPages(
          get,
          section.page,
          loaded[section.key] ?? 0,
          (cursor) => pageQuery(req, section.key, cursor)
        )
        waiting = waiting || pages.waiting
        return {
          key: section.key,
          count: section.count,
          estimates: section.estimates,
          page: {
            items: withCreatedKeys(pages.items.map(toRow), created),
            nextCursor: pages.nextCursor
          }
        }
      })
      return AsyncResult.success<SprintSectionsValue>(
        {
          total: base.value.total,
          counts: base.value.counts,
          sections,
          viewer
        },
        { waiting }
      )
    },
    (refresh) => refresh(snapshotQuery(req))
  )

export const sprintSections = Atom.family((req: SprintSectionsRequest) =>
  Atom.optimistic(sprintSectionsView(req))
)

export const loadMoreSprintSections = Atom.family(
  ({
    req,
    key
  }: Readonly<{
    req: SprintSectionsRequest
    key: SprintSectionKey
  }>) =>
    Api.runtime.fn(
      Effect.fn("loadMoreSprintSections")(function* (
        _input: void,
        get: Atom.FnContext
      ) {
        return yield* loadNextPage(get, {
          visibleCursor: () => {
            const current = get(sprintSections(req))
            return AsyncResult.isSuccess(current)
              ? current.value.sections.find((section) => section.key === key)
                  ?.page.nextCursor
              : undefined
          },
          depth: () => get(loadedPagesAtom(req))[key] ?? 0,
          firstCursor: () => {
            const base = get(snapshotQuery(req))
            return AsyncResult.isSuccess(base)
              ? (base.value.sections.find((section) => section.key === key)
                  ?.page.nextCursor ?? null)
              : undefined
          },
          page: (cursor) => pageQuery(req, key, cursor),
          deepen: (depth) =>
            get.set(loadedPagesAtom(req), {
              ...get(loadedPagesAtom(req)),
              [key]: depth
            })
        })
      })
    )
)

const shift = (current: number, out: number, into: number) =>
  Math.max(0, current - out + into)

const shiftEstimates = (
  summary: EstimateSummary | null,
  removed: Ticket | null,
  added: Ticket | null,
  finished: ReadonlySet<string>
): EstimateSummary | null => {
  if (summary === null) return null
  const minus = summarizeEstimates(
    removed ? [removed] : [],
    summary.unit,
    finished
  )
  const plus = summarizeEstimates(added ? [added] : [], summary.unit, finished)
  const unestimated = shift(
    summary.unestimated,
    minus.unestimated,
    plus.unestimated
  )
  if (summary.unit === "tshirt") {
    if (minus.unit !== "tshirt" || plus.unit !== "tshirt") return summary
    return {
      ...summary,
      unestimated,
      sizes: {
        XS: shift(summary.sizes.XS, minus.sizes.XS, plus.sizes.XS),
        S: shift(summary.sizes.S, minus.sizes.S, plus.sizes.S),
        M: shift(summary.sizes.M, minus.sizes.M, plus.sizes.M),
        L: shift(summary.sizes.L, minus.sizes.L, plus.sizes.L),
        XL: shift(summary.sizes.XL, minus.sizes.XL, plus.sizes.XL)
      }
    }
  }
  if (minus.unit === "tshirt" || plus.unit === "tshirt") return summary
  return {
    ...summary,
    unestimated,
    committed: shift(summary.committed, minus.committed, plus.committed),
    done: shift(summary.done, minus.done, plus.done)
  }
}

const patchRow = (
  value: SprintSectionsValue,
  id: TicketId,
  patch: UpdateTicketInput,
  query: TicketListQuery,
  now: Date
): SprintSectionsValue => {
  let patched: TicketRow | undefined
  let from: TicketStatus | undefined
  let staysCounted = true
  let staysVisible = true
  const sections = value.sections.map((section) => {
    const items: Array<TicketRow> = []
    let found: TicketRow | undefined
    let before: Ticket | undefined
    for (const row of section.page.items) {
      if (row.ticket.id !== id) {
        items.push(row)
        continue
      }
      before = row.ticket
      from = row.ticket.status
      found = patchTicketRow(row, patch, query.sort, now)
      patched = found
      staysCounted = matchesTicketQuery(
        found.ticket,
        { ...query, status: undefined },
        value.viewer.id,
        value.viewer.estimation
      )
      staysVisible = matchesTicketQuery(
        found.ticket,
        query,
        value.viewer.id,
        value.viewer.estimation
      )
    }
    if (found === undefined || before === undefined) return section
    return {
      ...section,
      count: section.count - (staysVisible ? 0 : 1),
      estimates: shiftEstimates(
        section.estimates,
        before,
        found.ticket,
        value.viewer.finished
      ),
      page: {
        ...section.page,
        items: staysVisible
          ? insertByOrderKey(items, found, query.sort.dir)
          : items
      }
    }
  })
  if (!patched || from === undefined) return value
  const to = patched.ticket.status
  if (to === from && staysCounted && staysVisible) return { ...value, sections }
  const byStatus = { ...value.counts.byStatus }
  byStatus[from] = Math.max(0, (byStatus[from] ?? 0) - 1)
  if (staysCounted) byStatus[to] = (byStatus[to] ?? 0) + 1
  return {
    ...value,
    total: value.total - (staysVisible ? 0 : 1),
    counts: {
      total: value.counts.total - (staysCounted ? 0 : 1),
      byStatus
    },
    sections
  }
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
            row.ticket.id === ticket.id ? { ...row, ticket } : row
          )
        }
      }
    }
    const items: Array<TicketRow> = []
    let moved: TicketRow | undefined
    for (const row of section.page.items) {
      if (row.ticket.id === ticket.id) moved = { ...row, ticket, orderKey }
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

export const updateSprintSectionsTicket = Atom.family(
  ({ req, id }: Readonly<{ req: SprintSectionsRequest; id: TicketId }>) =>
    coalescingTicketUpdate(sprintSections(req), {
      name: "updateSprintSectionsTicket",
      path: { ...req.params, id },
      sort: req.query.sort,
      predict: (value, patch) =>
        patchRow(
          value,
          id,
          patch,
          req.query,
          DateTime.toDate(DateTime.nowUnsafe())
        ),
      confirm: (value, { ticket, orderKey }) =>
        replaceRow(value, ticket, orderKey, req.query.sort)
    })
)

export const sprintSectionsTicketUpdates = bindRowMutation(
  updateSprintSectionsTicket
)

const assignedSprintId = (key: SprintSectionKey): GroupId | undefined =>
  key === SPRINT_SECTION_UNSCHEDULED ? undefined : key

const insertCreated = (
  req: SprintSectionsRequest,
  key: SprintSectionKey,
  value: SprintSectionsValue,
  input: QuickCreateInput
): SprintSectionsValue => {
  const existing = value.sections.find((section) => section.key === key)
  const page = existing?.page ?? { items: [], nextCursor: null }
  const status = input.payload.status ?? TicketStatus.make("todo")
  const row = placeholderRow(
    input,
    page.items,
    status,
    DateTime.toDate(DateTime.nowUnsafe())
  )
  if (
    !matchesTicketQuery(
      row.ticket,
      { ...req.query, status: undefined },
      undefined,
      input.prediction.estimation
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
    estimates: shiftEstimates(
      existing?.estimates ?? null,
      null,
      row.ticket,
      value.viewer.finished
    ),
    page: { ...page, items: [row, ...page.items] }
  }
  return {
    ...value,
    total: value.total + 1,
    counts,
    sections: existing
      ? value.sections.map((section) =>
          section.key === key ? nextSection : section
        )
      : [nextSection, ...value.sections]
  }
}

const confirmCreated = (
  key: SprintSectionKey,
  value: SprintSectionsValue,
  created: Ticket,
  input: QuickCreateInput
): SprintSectionsValue => ({
  ...value,
  sections: value.sections.map((section) =>
    section.key !== key
      ? section
      : {
          ...section,
          page: {
            ...section.page,
            items: section.page.items.map((row) =>
              row.key === input.prediction.clientId
                ? { ...row, ticket: created, pending: false }
                : row
            )
          }
        }
  )
})

export const quickCreateSprintSectionsTicket = Atom.family(
  ({
    req,
    key
  }: Readonly<{
    req: SprintSectionsRequest
    key: SprintSectionKey
  }>) =>
    viewMutation(sprintSections(req), {
      name: "quickCreateSprintSectionsTicket",
      predict: (value, input: QuickCreateInput) =>
        insertCreated(req, key, value, input),
      call: (_client, input, get) =>
        createInSprint(req.params, input.payload, assignedSprintId(key)).pipe(
          Effect.tap((created) =>
            Effect.sync(() =>
              recordCreatedKey(
                get,
                scopeOf(req),
                created.id,
                input.prediction.clientId
              )
            )
          )
        ),
      confirm: (value, created, input) =>
        confirmCreated(key, value, created, input),
      publish: () => [
        ...Keys.ticketsChanged(scopeOf(req)),
        ...sprintAssignmentKeys(scopeOf(req), assignedSprintId(key))
      ]
    })
)
