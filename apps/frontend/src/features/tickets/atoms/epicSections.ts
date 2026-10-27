import {
  EPIC_SECTION_NONE,
  matchesTicketQuery,
  TicketStatus,
  type EpicSectionKey,
  type Ticket,
  type TicketId,
  type TicketListQuery,
  type TicketListRow,
  type UpdateTicketInput,
  type UserId
} from "@pp/shared"
import * as Cause from "effect/Cause"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

import {
  type BacklogRequest,
  type BacklogRow,
  placeholderId,
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

export const epicSectionsRequest = (
  orgSlug: string,
  slug: string,
  query: QueryWithView
): BacklogRequest => {
  const { view: _view, ...rest } = query
  return {
    params: { orgSlug, slug },
    query: { ...withoutEpicsByDefault(rest), cursor: undefined }
  }
}

const scopeOf = (req: BacklogRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export type EpicSectionValue = SectionValue<EpicSectionKey> &
  Readonly<{ title: string | null }>

export type EpicSectionsValue = SectionsValue<EpicSectionValue>

const TODO = Schema.decodeSync(TicketStatus)("todo")

const sectionOf = (ticket: Ticket): EpicSectionKey =>
  ticket.parent ?? EPIC_SECTION_NONE

const toRow = (row: TicketListRow): BacklogRow => ({
  ticket: row.ticket,
  key: row.ticket.id,
  orderKey: row.orderKey,
  pending: false
})

const snapshotQuery = (req: BacklogRequest) =>
  Api.query("tickets", "epicSections", {
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

const sectionTypes = (query: TicketListQuery) =>
  query.type?.filter((type) => type !== "epic")

const pageQuery = (req: BacklogRequest, key: EpicSectionKey, cursor: string) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: {
      ...req.query,
      type: sectionTypes(req.query),
      parent: [key],
      cursor
    },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.ticketPages(scopeOf(req)),
      Keys.orgMembers(req.params.orgSlug)
    ]
  })

const createdKeysAtom = Atom.family((_req: BacklogRequest) =>
  Atom.make<ReadonlyMap<TicketId, string>>(new Map()).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

const emptyEpicSections = (): EpicSectionsValue => ({
  total: 0,
  counts: { total: 0, byStatus: {} },
  sections: []
})

const epicSectionsView = (req: BacklogRequest) =>
  Atom.readable(
    (get) => {
      const base = get(snapshotQuery(req))
      if (!AsyncResult.isSuccess(base)) {
        return AsyncResult.map(base, emptyEpicSections)
      }
      const loaded = get(loadedPagesAtom(req))
      const createdKeys = get(createdKeysAtom(req))
      const parts: Array<AsyncResult.AsyncResult<unknown, unknown>> = [base]
      const sections = base.value.sections.map((section) => {
        const rows: Array<BacklogRow> = section.page.items.map(toRow)
        let nextCursor = section.page.nextCursor
        const depth = loaded[section.key] ?? 0
        for (let index = 0; index < depth; index++) {
          if (nextCursor === null) break
          const result = get(pageQuery(req, section.key, nextCursor))
          parts.push(result)
          if (!AsyncResult.isSuccess(result)) break
          for (const item of result.value.items) rows.push(toRow(item))
          nextCursor = result.value.nextCursor
        }
        return {
          key: section.key,
          title: section.title,
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
      return AsyncResult.success<EpicSectionsValue>(
        { total: base.value.total, counts: base.value.counts, sections },
        { waiting: parts.some((part) => part.waiting) }
      )
    },
    (refresh) => refresh(snapshotQuery(req))
  )

export const epicSections = Atom.family((req: BacklogRequest) =>
  Atom.optimistic(epicSectionsView(req))
)

export const loadMoreEpicSections = Atom.family(
  ({ req, key }: Readonly<{ req: BacklogRequest; key: EpicSectionKey }>) =>
    Api.runtime.fn(
      Effect.fn("loadMoreEpicSections")(function* (
        _input: void,
        get: Atom.FnContext
      ) {
        return yield* loadMoreSection(get, {
          key,
          sections: epicSections(req),
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

export const updateEpicSectionsTicket = Atom.family(
  ({
    req,
    id,
    viewerId
  }: Readonly<{
    req: BacklogRequest
    id: TicketId
    viewerId: UserId | undefined
  }>) =>
    Atom.optimisticFn(epicSections(req), {
      reducer: (current, patch: UpdateTicketInput) =>
        AsyncResult.map(current, (value) =>
          patchSectionsRow(
            value,
            id,
            patch,
            req.query,
            viewerId,
            DateTime.toDate(DateTime.nowUnsafe()),
            sectionOf
          )
        ),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("updateEpicSectionsTicket")(function* (
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
              AsyncResult.map(get(epicSections(req)), (value) =>
                replaceSectionsRow(
                  value,
                  updated,
                  orderKey,
                  req.query.sort,
                  sectionOf
                )
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

export const quickCreateEpicSectionsTicket = Atom.family(
  ({ req, key }: Readonly<{ req: BacklogRequest; key: EpicSectionKey }>) =>
    Atom.optimisticFn(epicSections(req), {
      reducer: (current, input: QuickCreateArg) =>
        AsyncResult.map(current, (value) => {
          const existing = value.sections.find((section) => section.key === key)
          if (existing === undefined) return value
          const status = input.ticket.status ?? TODO
          const predicted = predictedTicket(
            input,
            placeholderId(existing.page.items, input.projectPrefix),
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
          const counts = {
            total: value.counts.total + 1,
            byStatus: {
              ...value.counts.byStatus,
              [status]: (value.counts.byStatus[status] ?? 0) + 1
            }
          }
          if (req.query.status?.length && !req.query.status.includes(status))
            return { ...value, counts }
          return {
            total: value.total + 1,
            counts,
            sections: value.sections.map((section) =>
              section.key !== key
                ? section
                : {
                    ...section,
                    count: section.count + 1,
                    page: {
                      ...section.page,
                      items: [
                        {
                          ticket: predicted,
                          key: input.clientId,
                          orderKey: null,
                          pending: true
                        },
                        ...section.page.items
                      ]
                    }
                  }
            )
          }
        }),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn("quickCreateEpicSectionsTicket")(function* (
            input: QuickCreateArg,
            get
          ) {
            const created = yield* Api.use((client) =>
              client.tickets.quickCreate({
                params: req.params,
                payload: input.ticket
              })
            )
            const index = createdKeysAtom(req)
            get.set(index, new Map(get(index)).set(created.id, input.clientId))
            set(
              AsyncResult.map(get(epicSections(req)), (value) => ({
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
                              ? { ...row, ticket: created, pending: false }
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
              Keys.ticketPages(scopeOf(req))
            ])
            return created
          })
        )
    })
)
