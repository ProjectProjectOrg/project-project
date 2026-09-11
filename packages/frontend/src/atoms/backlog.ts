import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import {
  ticketListQueryToSearch,
  type Ticket,
  type TicketCounts,
  type TicketId,
  type TicketListQuery,
  type TicketStatus,
  type UpdateTicketInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { applyTicketPatch } from "./ticketPatch"

export interface BacklogRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
  readonly query: Record<string, string | ReadonlyArray<string>>
}

/**
 * Build the request that identifies one backlog. Status filter and cursor are
 * dropped because the sections endpoint returns every status with its own first
 * page. This replaces the old `ticketsSectionsKey` string builder.
 */
export const backlogRequest = (
  orgSlug: string,
  slug: string,
  query: TicketListQuery
): BacklogRequest => ({
  params: { orgSlug, slug },
  query: ticketListQueryToSearch({
    ...query,
    filter: { ...query.filter, status: undefined },
    cursor: undefined
  })
})

const scopeOf = (req: BacklogRequest) =>
  projectScope(req.params.orgSlug, req.params.slug)

export interface BacklogRow {
  readonly ticket: Ticket
  /** React key. Equals the ticket id except for rows created in this session. */
  readonly key: string
  readonly pending: boolean
}

export interface BacklogSection {
  readonly items: ReadonlyArray<BacklogRow>
  readonly nextCursor: string | null
}

export interface BacklogValue {
  readonly counts: TicketCounts
  readonly sections: Readonly<Record<string, BacklogSection>>
}

const toRow = (ticket: Ticket): BacklogRow => ({
  ticket,
  key: ticket.id,
  pending: false
})

const sectionsQuery = (req: BacklogRequest) =>
  Api.query("tickets", "sections", {
    params: req.params,
    query: req.query,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.ticketsIn(scopeOf(req))]
  })

/**
 * The composed backlog value. Task 6 extends this readable with loaded cursor
 * pages; the wrapper below never changes.
 */
const backlogView = (req: BacklogRequest) =>
  Atom.readable(
    (get) =>
      AsyncResult.map(
        AsyncResult.all([get(sectionsQuery(req))]),
        ([base]): BacklogValue => {
          const sections: Record<string, BacklogSection> = {}
          for (const [status, page] of Object.entries(base.sections)) {
            sections[status] = {
              items: page.items.map(toRow),
              nextCursor: page.nextCursor
            }
          }
          return { counts: base.counts, sections }
        }
      ),
    (refresh) => refresh(sectionsQuery(req))
  )

/** The value every backlog consumer reads. */
export const backlog = Atom.family((req: BacklogRequest) =>
  Atom.optimistic(backlogView(req))
)

const patchRow = (
  value: BacklogValue,
  id: TicketId,
  patch: UpdateTicketInput
): BacklogValue => {
  let moved: BacklogRow | undefined
  let from: TicketStatus | undefined
  const sections: Record<string, BacklogSection> = {}

  for (const [status, section] of Object.entries(value.sections)) {
    const items: Array<BacklogRow> = []
    for (const row of section.items) {
      if (row.ticket.id !== id) {
        items.push(row)
        continue
      }
      const next = { ...row, ticket: applyTicketPatch(row.ticket, patch) }
      // A status patch relocates the row; anything else edits it in place.
      if (patch.status !== undefined && patch.status !== status) {
        moved = next
        from = status as TicketStatus
      } else {
        items.push(next)
      }
    }
    sections[status] = { ...section, items }
  }

  if (!moved || patch.status === undefined) return { ...value, sections }

  const target = sections[patch.status] ?? { items: [], nextCursor: null }
  sections[patch.status] = {
    ...target,
    items: [moved, ...target.items.filter((row) => row.ticket.id !== id)]
  }

  const byStatus = { ...value.counts.byStatus }
  if (from !== undefined) {
    byStatus[from] = Math.max(0, (byStatus[from] ?? 0) - 1)
  }
  byStatus[patch.status] = (byStatus[patch.status] ?? 0) + 1

  return { counts: { total: value.counts.total, byStatus }, sections }
}

const replaceRow = (value: BacklogValue, ticket: Ticket): BacklogValue => {
  const sections: Record<string, BacklogSection> = {}
  for (const [status, section] of Object.entries(value.sections)) {
    sections[status] = {
      ...section,
      items: section.items.map((row) =>
        row.ticket.id === ticket.id ? { ...row, ticket } : row
      )
    }
  }
  return { ...value, sections }
}

export const updateBacklogTicket = Atom.family(
  ({ req, id }: { readonly req: BacklogRequest; readonly id: TicketId }) =>
    Atom.optimisticFn(backlog(req), {
      reducer: (current, patch: UpdateTicketInput) =>
        AsyncResult.map(current, (value) => patchRow(value, id, patch)),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (patch: UpdateTicketInput, get) {
            const updated = yield* Api.use((client) =>
              client.tickets.update({
                params: { ...req.params, id },
                payload: patch
              })
            )
            set(
              AsyncResult.map(get(backlog(req)), (value) =>
                replaceRow(value, updated)
              )
            )
            // Only keys other views listen to. `ticketsIn` is registered by
            // this view's own query, so publishing it here would refetch twice.
            yield* Reactivity.invalidate([
              Keys.ticket(scopeOf(req), id),
              Keys.ticketLists(scopeOf(req))
            ])
            return updated
          })
        )
    })
)
