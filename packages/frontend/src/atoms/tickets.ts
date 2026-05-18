import { Atom, Result } from "@effect-atom/atom-react"
import * as Reactivity from "@effect/experimental/Reactivity"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import {
  matchesTicketQuery,
  TicketCountQuery,
  TicketId,
  TicketListQuery,
  ticketListQueryToSearch,
  type MatchableTicket,
  type QuickCreateTicketInput,
  type Ticket,
  type TicketCounts,
  type UpdateTicketInput
} from "@projectproject/shared"

class MalformedQuery extends Data.TaggedError("MalformedQuery")<{
  readonly cause: unknown
}> {}

const encodeQueryForKey = Schema.encodeSync(TicketListQuery)

export const ticketsListKey = (
  orgSlug: string,
  slug: string,
  query: TicketListQuery
): string => {
  const encoded = encodeQueryForKey(query)
  return `${orgSlug}/${slug}/${JSON.stringify(encoded)}`
}

interface SplitFamilyKey {
  readonly orgSlug: string
  readonly slug: string
  readonly queryJson: string
}

const decodeQueryFromKey = Schema.decodeUnknownSync(TicketListQuery)

const splitFamilyKey = (key: string): SplitFamilyKey => {
  const firstSlash = key.indexOf("/")
  const secondSlash = key.indexOf("/", firstSlash + 1)
  return {
    orgSlug: key.slice(0, firstSlash),
    slug: key.slice(firstSlash + 1, secondSlash),
    queryJson: key.slice(secondSlash + 1)
  }
}

const decodeListQuery = (queryJson: string) =>
  Effect.try({
    // @effect-diagnostics-next-line preferSchemaOverJson:off
    try: () => decodeQueryFromKey(JSON.parse(queryJson) as unknown),
    catch: (cause) => new MalformedQuery({ cause })
  })

const makeTicketId = Schema.decodeUnknownSync(TicketId)

const splitTicketKey = (
  key: string
): { orgSlug: string; slug: string; id: TicketId } => {
  const parts = key.split("/")
  return {
    orgSlug: parts[0],
    slug: parts[1],
    id: makeTicketId(parts.slice(2).join("/"))
  }
}

interface TicketsListValue {
  readonly items: ReadonlyArray<Ticket>
  readonly nextCursor: string | null
}

export type { TicketsListValue }

const ticketsListBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug, queryJson } = splitFamilyKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const query = yield* decodeListQuery(queryJson)
        const client = yield* ApiClient
        const page = yield* client.tickets.list({
          path: { orgSlug, slug },
          urlParams: ticketListQueryToSearch(query)
        })
        const value: TicketsListValue = {
          items: page.items,
          nextCursor: page.nextCursor
        }
        return value
      })
    )
    .pipe(Atom.withReactivity(["tickets", orgSlug, slug]))
})

interface AppendedPagesValue {
  readonly items: ReadonlyArray<Ticket>
  readonly nextCursor: string | null
  readonly baseTimestamp: number | null
}

const ticketsListAppendedAtom = Atom.family((_key: string) =>
  Atom.make<AppendedPagesValue>({
    items: [],
    nextCursor: null,
    baseTimestamp: null
  })
)

export const ticketsListAtom = Atom.family((key: string) =>
  Atom.readable((get): Result.Result<TicketsListValue, unknown> => {
    const base: Result.Result<TicketsListValue, unknown> = get(
      ticketsListBaseAtom(key)
    )
    const appended = get(ticketsListAppendedAtom(key))
    if (!Result.isSuccess(base)) return base
    const fresh = appended.baseTimestamp === base.timestamp
    if (!fresh || appended.items.length === 0) return base
    const merged: TicketsListValue = {
      items: [...base.value.items, ...appended.items],
      nextCursor: appended.nextCursor
    }
    return Result.success(merged, {
      waiting: base.waiting,
      timestamp: base.timestamp
    })
  })
)

export const loadMoreTicketsAtom = Atom.family((key: string) => {
  const { orgSlug, slug, queryJson } = splitFamilyKey(key)
  return runtime.fn(
    Effect.fn(function* (_: void, get) {
      const base: Result.Result<TicketsListValue, unknown> = get(
        ticketsListBaseAtom(key)
      )
      if (!Result.isSuccess(base)) return
      const appended = get(ticketsListAppendedAtom(key))
      const fresh = appended.baseTimestamp === base.timestamp
      const cursor =
        fresh && appended.items.length > 0
          ? appended.nextCursor
          : base.value.nextCursor
      if (cursor === null) return
      const query = yield* decodeListQuery(queryJson)
      const client = yield* ApiClient
      const next = yield* client.tickets.list({
        path: { orgSlug, slug },
        urlParams: ticketListQueryToSearch({ ...query, cursor })
      })
      get.set(ticketsListAppendedAtom(key), {
        items: fresh ? [...appended.items, ...next.items] : next.items,
        nextCursor: next.nextCursor,
        baseTimestamp: base.timestamp
      })
    })
  )
})

const encodeCountQueryForKey = Schema.encodeSync(TicketCountQuery)

export const ticketsCountKey = (
  orgSlug: string,
  slug: string,
  query: TicketCountQuery
): string => {
  const encoded = encodeCountQueryForKey(query)
  return `${orgSlug}/${slug}/${JSON.stringify(encoded)}`
}

const decodeCountQueryFromKey = Schema.decodeUnknownSync(TicketCountQuery)

const decodeCountQuery = (queryJson: string) =>
  Effect.try({
    // @effect-diagnostics-next-line preferSchemaOverJson:off
    try: () => decodeCountQueryFromKey(JSON.parse(queryJson) as unknown),
    catch: (cause) => new MalformedQuery({ cause })
  })

const ticketsCountBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug, queryJson } = splitFamilyKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const query = yield* decodeCountQuery(queryJson)
        const client = yield* ApiClient
        return yield* client.tickets.count({
          path: { orgSlug, slug },
          urlParams: ticketListQueryToSearch(query)
        })
      })
    )
    .pipe(Atom.withReactivity(["tickets", orgSlug, slug]))
})

export const ticketsCountAtom = Atom.family((key: string) =>
  Atom.optimistic(ticketsCountBaseAtom(key))
)

const parseCountQueryFromKey = (queryJson: string): TicketCountQuery | null => {
  try {
    const raw = JSON.parse(queryJson) as unknown
    return decodeCountQueryFromKey(raw)
  } catch {
    return null
  }
}

const predictedTicketFromCreate = (
  input: QuickCreateTicketInput,
  _viewerId: string
): MatchableTicket => ({
  id: "",
  title: input.title,
  status: "todo",
  type: input.type ?? "other",
  tags: [],
  branch: null,
  pr: null,
  assignees: [],
  updatedAt: DateTime.toDate(DateTime.unsafeNow())
})

const applyCreateDelta = (
  current: TicketCounts,
  ticket: Pick<MatchableTicket, "status">
): TicketCounts => ({
  total: current.total + 1,
  byStatus: {
    ...current.byStatus,
    [ticket.status]: (current.byStatus[ticket.status] ?? 0) + 1
  }
})

export const ticketKey = (orgSlug: string, slug: string, id: TicketId) =>
  `${orgSlug}/${slug}/${id}`

export const ticketBodyDraftAtom = Atom.family((_key: string) =>
  Atom.make<string | null>(null).pipe(Atom.setIdleTTL("10 minutes"))
)

export const ticketBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.tickets.get({ path: { orgSlug, slug, id } })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
})

export const ticketAtom = ticketBaseAtom

export interface QuickCreateTicketArg {
  readonly ticket: QuickCreateTicketInput
  readonly viewerId: string
}

export const quickCreateTicketAtom = Atom.family((countKey: string) => {
  const { orgSlug, slug, queryJson } = splitFamilyKey(countKey)
  return Atom.optimisticFn(ticketsCountAtom(countKey), {
    reducer: (current, input: QuickCreateTicketArg) => {
      if (!Result.isSuccess(current)) return current
      const countQuery = parseCountQueryFromKey(queryJson)
      if (countQuery === null) return current
      if (countQuery.filter?.groupId !== undefined) return current
      const predicted = predictedTicketFromCreate(input.ticket, input.viewerId)
      if (!matchesTicketQuery(predicted, countQuery, input.viewerId)) {
        return current
      }
      return Result.success(applyCreateDelta(current.value, predicted), {
        waiting: true
      })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: QuickCreateTicketArg, get) {
        const client = yield* ApiClient
        const ticket = yield* client.tickets.quickCreate({
          path: { orgSlug, slug },
          payload: input.ticket
        })
        get.refresh(ticketsCountBaseAtom(countKey))
        yield* Reactivity.invalidate(["tickets", orgSlug, slug])
        return ticket
      })
    )
  })
})

export const updateTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  return runtime.fn(
    Effect.fn(function* (input: UpdateTicketInput, get) {
      const client = yield* ApiClient
      const updated = yield* client.tickets.update({
        path: { orgSlug, slug, id },
        payload: input
      })
      get.refresh(ticketBaseAtom(ticketKey(orgSlug, slug, id)))
      yield* Reactivity.invalidate(["tickets", orgSlug, slug])
      return updated
    })
  )
})

export const deleteTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  return runtime.fn(
    Effect.fn(function* (_input: void, _get) {
      const client = yield* ApiClient
      yield* client.tickets.delete({ path: { orgSlug, slug, id } })
      yield* Reactivity.invalidate(["tickets", orgSlug, slug])
    })
  )
})
