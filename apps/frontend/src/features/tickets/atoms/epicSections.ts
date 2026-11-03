import {
  matchesTicketQuery,
  type EpicSectionKey,
  type Ticket,
  type TicketId,
  type TicketListQuery,
  TicketStatus
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { query } from "@/api/query"
import { bindRowMutation, viewMutation } from "@/api/viewMutation"
import { currentUserId } from "@/features/auth/atoms/auth"
import {
  projectEstimation,
  projectRequest
} from "@/features/projects/atoms/projects"
import {
  patchEpicSectionsRow,
  replaceEpicSectionsRow,
  type EpicSectionsValue
} from "@/features/tickets/lib/epicSectionRows"
import {
  placeholderRow,
  toRow,
  withCreatedKeys,
  viewQuery,
  type QueryWithView,
  type QuickCreateInput
} from "@/features/tickets/lib/ticketRows"

import {
  coalescingTicketUpdate,
  createdKeys,
  loadNextPage,
  readLoadedPages,
  recordCreatedKey
} from "./ticketRows"

export type EpicSectionsRequest = Readonly<{
  _view: "epicSections"
  params: Readonly<{ orgSlug: string; slug: string }>
  query: TicketListQuery
}>

export const epicSectionsRequest = (
  orgSlug: string,
  slug: string,
  query: QueryWithView
): EpicSectionsRequest => ({
  _view: "epicSections",
  params: { orgSlug, slug },
  query: {
    ...viewQuery(query),
    cursor: undefined
  }
})

const scopeOf = (req: EpicSectionsRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

const snapshotQuery = (req: EpicSectionsRequest) =>
  query("tickets", "epicSections", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const loadedPagesAtom = Atom.family((_req: EpicSectionsRequest) =>
  Atom.make<Readonly<Record<string, number>>>({}).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

const pageQuery = (
  req: EpicSectionsRequest,
  key: EpicSectionKey,
  cursor: string
) =>
  query("tickets", "list", {
    params: req.params,
    query: {
      ...req.query,
      type: req.query.type?.filter((type) => type !== "epic"),
      section: { parent: [key] },
      cursor
    },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.ticketPages(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const viewerOf = (get: Atom.AtomContext, req: EpicSectionsRequest) => ({
  id: get(currentUserId),
  estimation: get(
    projectEstimation(projectRequest(req.params.orgSlug, req.params.slug))
  )
})

const emptyEpicSections = (
  viewer: EpicSectionsValue["viewer"]
): EpicSectionsValue => ({
  total: 0,
  counts: { total: 0, byStatus: {} },
  sections: [],
  viewer
})

const epicSectionsView = (req: EpicSectionsRequest) =>
  Atom.readable(
    (get) => {
      const base = get(snapshotQuery(req))
      const viewer = viewerOf(get, req)
      if (!AsyncResult.isSuccess(base)) {
        return AsyncResult.map(base, () => emptyEpicSections(viewer))
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
          title: section.title,
          count: section.count,
          page: {
            items: withCreatedKeys(pages.items.map(toRow), created),
            nextCursor: pages.nextCursor
          }
        }
      })
      return AsyncResult.success<EpicSectionsValue>(
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

export const epicSections = Atom.family((req: EpicSectionsRequest) =>
  Atom.optimistic(epicSectionsView(req))
)

export const loadMoreEpicSections = Atom.family(
  ({ req, key }: Readonly<{ req: EpicSectionsRequest; key: EpicSectionKey }>) =>
    Api.runtime.fn(
      Effect.fn("loadMoreEpicSections")(function* (
        _input: void,
        get: Atom.FnContext
      ) {
        return yield* loadNextPage(get, {
          visibleCursor: () => {
            const current = get(epicSections(req))
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

export const updateEpicSectionsTicket = Atom.family(
  ({ req, id }: Readonly<{ req: EpicSectionsRequest; id: TicketId }>) =>
    coalescingTicketUpdate(epicSections(req), {
      name: "updateEpicSectionsTicket",
      path: { ...req.params, id },
      sort: req.query.sort,
      predict: (value, patch) =>
        patchEpicSectionsRow(
          value,
          id,
          patch,
          req.query,
          DateTime.toDate(DateTime.nowUnsafe())
        ),
      confirm: (value, { ticket, orderKey }) =>
        replaceEpicSectionsRow(value, ticket, orderKey, req.query.sort)
    })
)

export const epicSectionsTicketUpdates = bindRowMutation(
  updateEpicSectionsTicket
)

const insertCreated = (
  req: EpicSectionsRequest,
  key: EpicSectionKey,
  value: EpicSectionsValue,
  input: QuickCreateInput
): EpicSectionsValue => {
  const existing = value.sections.find((section) => section.key === key)
  if (existing === undefined) return value
  const status = input.payload.status ?? TicketStatus.make("todo")
  const row = placeholderRow(
    input,
    existing.page.items,
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
  const counts = {
    total: value.counts.total + 1,
    byStatus: {
      ...value.counts.byStatus,
      [status]: (value.counts.byStatus[status] ?? 0) + 1
    }
  }
  if (req.query.status?.length && !req.query.status.includes(status)) {
    return { ...value, counts }
  }
  return {
    ...value,
    total: value.total + 1,
    counts,
    sections: value.sections.map((section) =>
      section.key !== key
        ? section
        : {
            ...section,
            count: section.count + 1,
            page: { ...section.page, items: [row, ...section.page.items] }
          }
    )
  }
}

const confirmCreated = (
  key: EpicSectionKey,
  value: EpicSectionsValue,
  created: Ticket,
  input: QuickCreateInput
): EpicSectionsValue => ({
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

export const quickCreateEpicSectionsTicket = Atom.family(
  ({ req, key }: Readonly<{ req: EpicSectionsRequest; key: EpicSectionKey }>) =>
    viewMutation(epicSections(req), {
      name: "quickCreateEpicSectionsTicket",
      predict: (value, input: QuickCreateInput) =>
        insertCreated(req, key, value, input),
      call: (client, input, get) =>
        client.tickets
          .quickCreate({ params: req.params, payload: input.payload })
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
      confirm: (value, created, input) =>
        confirmCreated(key, value, created, input),
      publish: () => Keys.ticketsChanged(scopeOf(req))
    })
)
