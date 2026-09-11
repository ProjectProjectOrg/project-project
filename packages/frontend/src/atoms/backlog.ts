import * as Effect from "effect/Effect"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import {
  ticketListQueryToSearch,
  type QuickCreateTicketInput,
  type Ticket,
  type TicketCounts,
  type TicketId,
  type TicketListQuery,
  type UpdateTicketInput
} from "@projectproject/shared"
import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"
import { Results } from "./lib/results"
import { applyTicketPatch } from "./ticketPatch"

export interface BacklogRequest {
  readonly params: { readonly orgSlug: string; readonly slug: string }
  readonly query: Record<string, string | ReadonlyArray<string>>
}

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

const loadedPagesAtom = Atom.family((_req: BacklogRequest) =>
  Atom.make<Readonly<Record<string, ReadonlyArray<string>>>>({}).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

const pageQuery = (req: BacklogRequest, status: string, cursor: string) =>
  Api.query("tickets", "list", {
    params: req.params,
    query: { ...req.query, status: [status], cursor },
    timeToLive: "2 minutes",
    reactivityKeys: [
      Keys.ticketsIn(scopeOf(req)),
      Keys.ticketPages(scopeOf(req))
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

const createdKeysAtom = Atom.family((_scope: string) =>
  Atom.make<ReadonlyMap<TicketId, string>>(new Map()).pipe(
    Atom.setIdleTTL("2 minutes")
  )
)

const backlogView = (req: BacklogRequest) =>
  Atom.readable(
    (get) => {
      const base = get(sectionsQuery(req))
      if (!AsyncResult.isSuccess(base)) return base
      const loaded = get(loadedPagesAtom(req))
      const createdKeys = get(createdKeysAtom(scopeOf(req)))
      const parts: Array<AsyncResult.AsyncResult<unknown, unknown>> = [base]
      const sections: Record<string, BacklogSection> = {}

      for (const [status, page] of Object.entries(base.value.sections)) {
        const rows: Array<BacklogRow> = page.items.map(toRow)
        let nextCursor = page.nextCursor
        for (const cursor of loaded[status] ?? []) {
          const result = get(pageQuery(req, status, cursor))
          parts.push(result)
          if (!AsyncResult.isSuccess(result)) continue
          for (const ticket of result.value.items) rows.push(toRow(ticket))
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

      const { waiting, timestamp } = Results.meta(parts)
      return AsyncResult.success<BacklogValue>(
        { counts: base.value.counts, sections },
        { waiting, timestamp }
      )
    },
    (refresh) => refresh(sectionsQuery(req))
  )

export const backlog = Atom.family((req: BacklogRequest) =>
  Atom.optimistic(backlogView(req))
)

const patchRow = (
  value: BacklogValue,
  id: TicketId,
  patch: UpdateTicketInput
): BacklogValue => {
  let moved: BacklogRow | undefined
  let from: string | undefined
  const sections: Record<string, BacklogSection> = {}

  for (const [status, section] of Object.entries(value.sections)) {
    const items: Array<BacklogRow> = []
    for (const row of section.items) {
      if (row.ticket.id !== id) {
        items.push(row)
        continue
      }
      const next = { ...row, ticket: applyTicketPatch(row.ticket, patch) }
      if (patch.status !== undefined && patch.status !== status) {
        moved = next
        from = status
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
            yield* Reactivity.invalidate([
              Keys.ticket(scopeOf(req), id),
              Keys.ticketLists(scopeOf(req)),
              Keys.ticketPages(scopeOf(req))
            ])
            return updated
          })
        )
    })
)

export const loadMoreBacklog = Atom.family(
  ({
    req,
    status
  }: {
    readonly req: BacklogRequest
    readonly status: string
  }) =>
    Api.runtime.fn(
      Effect.fn(function* (_input: void, get) {
        const current = get(backlog(req))
        if (!AsyncResult.isSuccess(current)) return
        const cursor = current.value.sections[status]?.nextCursor
        if (!cursor) return
        const loaded = get(loadedPagesAtom(req))
        const cursors = loaded[status] ?? []
        if (cursors.includes(cursor)) return
        get.set(loadedPagesAtom(req), {
          ...loaded,
          [status]: [...cursors, cursor]
        })
      })
    )
)

export interface QuickCreateArg {
  readonly ticket: QuickCreateTicketInput
  readonly viewerId: string
  readonly projectPrefix: string
  readonly clientId: string
}

const placeholderId = (
  taken: ReadonlyArray<BacklogRow>,
  prefix: string
): TicketId => {
  const used = new Set(taken.map((row) => row.ticket.id))
  let n = 999999
  while (used.has(`${prefix}-${n}` as TicketId)) n++
  return `${prefix}-${n}` as TicketId
}

export const quickCreateBacklogTicket = Atom.family((req: BacklogRequest) =>
  Atom.optimisticFn(backlog(req), {
    reducer: (current, input: QuickCreateArg) =>
      AsyncResult.map(current, (value) => {
        const status = input.ticket.status ?? "todo"
        const section = value.sections[status] ?? {
          items: [],
          nextCursor: null
        }
        const now = new Date()
        const predicted: Ticket = {
          id: placeholderId(section.items, input.projectPrefix),
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
                { ticket: predicted, key: input.clientId, pending: true },
                ...section.items
              ]
            }
          }
        }
      }),
    fn: Api.runtime.fn(
      Effect.fn(function* (input: QuickCreateArg, get) {
        const created = yield* Api.use((client) =>
          client.tickets.quickCreate({
            params: req.params,
            payload: input.ticket
          })
        )
        const index = createdKeysAtom(scopeOf(req))
        get.set(index, new Map(get(index)).set(created.id, input.clientId))
        yield* Reactivity.invalidate([
          Keys.ticketLists(scopeOf(req)),
          Keys.ticketPages(scopeOf(req))
        ])
        return created
      })
    )
  })
)
