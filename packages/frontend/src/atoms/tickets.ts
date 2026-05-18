import { Atom, Result } from "@effect-atom/atom-react"
import * as Reactivity from "@effect/experimental/Reactivity"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SubscriptionRef from "effect/SubscriptionRef"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import {
  TicketCountQuery,
  TicketId,
  TicketListQuery,
  ticketListQueryToSearch,
  type QuickCreateTicketInput,
  type Ticket,
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

interface SplitTicketsListKey {
  readonly orgSlug: string
  readonly slug: string
  readonly queryJson: string
}

const decodeQueryFromKey = Schema.decodeUnknownSync(TicketListQuery)

const splitTicketsListKey = (key: string): SplitTicketsListKey => {
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

const splitProjectKey = (key: string): { orgSlug: string; slug: string } => {
  const idx = key.indexOf("/")
  return { orgSlug: key.slice(0, idx), slug: key.slice(idx + 1) }
}

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

export const ticketsListAtom = Atom.family((key: string) => {
  const { orgSlug, slug, queryJson } = splitTicketsListKey(key)
  return runtime
    .subscriptionRef(
      Effect.gen(function* () {
        const query = yield* decodeListQuery(queryJson)
        const client = yield* ApiClient
        const page = yield* client.tickets.list({
          path: { orgSlug, slug },
          urlParams: ticketListQueryToSearch(query)
        })
        return yield* SubscriptionRef.make<TicketsListValue>({
          items: page.items,
          nextCursor: page.nextCursor
        })
      })
    )
    .pipe(
      Atom.withReactivity(["tickets", orgSlug, slug]),
      Atom.setIdleTTL("30 seconds")
    )
})

export const loadMoreTicketsAtom = Atom.family((key: string) => {
  const { orgSlug, slug, queryJson } = splitTicketsListKey(key)
  return runtime.fn(
    Effect.fn(function* (_: void, get) {
      const current: Result.Result<TicketsListValue, unknown> = get(
        ticketsListAtom(key)
      )
      if (!Result.isSuccess(current)) return
      if (current.value.nextCursor === null) return
      const query = yield* decodeListQuery(queryJson)
      const client = yield* ApiClient
      const next = yield* client.tickets.list({
        path: { orgSlug, slug },
        urlParams: ticketListQueryToSearch({
          ...query,
          cursor: current.value.nextCursor
        })
      })
      get.set(ticketsListAtom(key), {
        items: [...current.value.items, ...next.items],
        nextCursor: next.nextCursor
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

export const ticketsCountAtom = Atom.family((key: string) => {
  const { orgSlug, slug, queryJson } = splitTicketsListKey(key)
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
    .pipe(
      Atom.withReactivity(["tickets", orgSlug, slug]),
      Atom.setIdleTTL("30 seconds")
    )
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

export const quickCreateTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime.fn(
    Effect.fn(function* (input: QuickCreateTicketInput, _get) {
      const client = yield* ApiClient
      const ticket = yield* client.tickets.quickCreate({
        path: { orgSlug, slug },
        payload: input
      })
      yield* Reactivity.invalidate(["tickets", orgSlug, slug])
      return ticket
    })
  )
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
