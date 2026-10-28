import {
  matchesTicketQuery,
  type Ticket,
  type TicketCounts,
  type TicketId,
  TicketListQuery,
  type TicketSort,
  TicketStatus,
  type UpdateTicketInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { bindRowMutation, viewMutation } from "@/api/viewMutation"
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

export const encodeTicketListQuery = Schema.encodeSync(
  Schema.fromJsonString(TicketListQuery)
)

export type BacklogRequest = Readonly<{
  _view: "backlog"
  params: Readonly<{ orgSlug: string; slug: string }>
  query: TicketListQuery
}>

export const backlogRequest = (
  orgSlug: string,
  slug: string,
  query: QueryWithView
): BacklogRequest => ({
  _view: "backlog",
  params: { orgSlug, slug },
  query: {
    ...viewQuery(query),
    status: undefined,
    cursor: undefined
  }
})

const scopeOf = (req: BacklogRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export type BacklogValue = Readonly<{
  counts: TicketCounts
  sections: Readonly<Record<string, TicketRowPage>>
}>

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

const pageQuery = (req: BacklogRequest, status: string, cursor: string) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: {
      ...req.query,
      section: { status: [TicketStatus.make(status)] },
      cursor
    },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.ticketPages(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

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
      const created = get(createdKeys(scopeOf(req)))
      let waiting = base.waiting
      const sections: Record<string, TicketRowPage> = {}

      for (const [status, page] of Object.entries(base.value.sections)) {
        const pages = readLoadedPages(
          get,
          page,
          loaded[status] ?? 0,
          (cursor) => pageQuery(req, status, cursor)
        )
        waiting = waiting || pages.waiting
        sections[status] = {
          items: withCreatedKeys(pages.items.map(toRow), created),
          nextCursor: pages.nextCursor
        }
      }

      // A failed or unmounted page must not fail the region, so this is not `AsyncResult.all`.
      return AsyncResult.success<BacklogValue>(
        { counts: base.value.counts, sections },
        { waiting }
      )
    },
    (refresh) => refresh(sectionsQuery(req))
  )

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
        return yield* loadNextPage(get, {
          visibleCursor: () => {
            const current = get(backlog(req))
            return AsyncResult.isSuccess(current)
              ? current.value.sections[status]?.nextCursor
              : undefined
          },
          depth: () => get(loadedPagesAtom(req))[status] ?? 0,
          firstCursor: () => {
            const base = get(sectionsQuery(req))
            return AsyncResult.isSuccess(base)
              ? (base.value.sections[TicketStatus.make(status)]?.nextCursor ??
                  null)
              : undefined
          },
          page: (cursor) => pageQuery(req, status, cursor),
          deepen: (depth) =>
            get.set(loadedPagesAtom(req), {
              ...get(loadedPagesAtom(req)),
              [status]: depth
            })
        })
      })
    )
)

const patchRow = (
  value: BacklogValue,
  id: TicketId,
  patch: UpdateTicketInput,
  sort: TicketSort,
  now: Date
): BacklogValue => {
  let patched: TicketRow | undefined
  let from: TicketStatus | undefined
  const sections: Record<string, TicketRowPage> = {}

  for (const [status, section] of Object.entries(value.sections)) {
    const items: Array<TicketRow> = []
    for (const row of section.items) {
      if (row.ticket.id !== id) {
        items.push(row)
        continue
      }
      patched = patchTicketRow(row, patch, sort, now)
      from = TicketStatus.make(status)
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
  const sections: Record<string, TicketRowPage> = {}
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
    const items: Array<TicketRow> = []
    let moved: TicketRow | undefined
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

export const updateBacklogTicket = Atom.family(
  ({ req, id }: Readonly<{ req: BacklogRequest; id: TicketId }>) =>
    coalescingTicketUpdate(backlog(req), {
      name: "updateBacklogTicket",
      path: { ...req.params, id },
      sort: req.query.sort,
      predict: (value, patch) =>
        patchRow(
          value,
          id,
          patch,
          req.query.sort,
          DateTime.toDate(DateTime.nowUnsafe())
        ),
      confirm: (value, { ticket, orderKey }) =>
        replaceRow(value, ticket, orderKey, req.query.sort)
    })
)

export const backlogTicketUpdates = bindRowMutation(updateBacklogTicket)

const filtersBySprint = (req: BacklogRequest) =>
  (req.query.groupId?.length ?? 0) > 0 &&
  !req.query.groupId?.includes("ungrouped")

const insertCreated = (
  req: BacklogRequest,
  value: BacklogValue,
  input: QuickCreateInput
): BacklogValue => {
  const status = input.payload.status ?? TicketStatus.make("todo")
  const section = value.sections[status] ?? { items: [], nextCursor: null }
  const row = placeholderRow(
    input,
    section.items,
    status,
    DateTime.toDate(DateTime.nowUnsafe())
  )
  if (
    !matchesTicketQuery(
      row.ticket,
      { ...req.query, status: undefined },
      undefined,
      input.prediction.estimation
    ) ||
    filtersBySprint(req)
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
      [status]: { ...section, items: [row, ...section.items] }
    }
  }
}

const confirmCreated = (
  value: BacklogValue,
  created: Ticket,
  input: QuickCreateInput
): BacklogValue => ({
  ...value,
  sections: Object.fromEntries(
    Object.entries(value.sections).map(([status, section]) => [
      status,
      {
        ...section,
        items: section.items.map((row) =>
          row.key === input.prediction.clientId
            ? { ...row, ticket: created, pending: false }
            : row
        )
      }
    ])
  )
})

export const quickCreateBacklogTicket = Atom.family((req: BacklogRequest) =>
  viewMutation(backlog(req), {
    name: "quickCreateBacklogTicket",
    predict: (value, input: QuickCreateInput) =>
      insertCreated(req, value, input),
    call: (client, input, get) =>
      client.tickets
        .quickCreate({
          params: req.params,
          payload: input.payload
        })
        .pipe(
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
    confirm: confirmCreated,
    publish: () => Keys.ticketsChanged(scopeOf(req))
  })
)
