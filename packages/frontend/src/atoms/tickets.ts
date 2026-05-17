import { Atom, Result } from "@effect-atom/atom-react"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as SubscriptionRef from "effect/SubscriptionRef"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import {
  TicketId,
  TicketListQuery,
  ticketListQueryToSearch,
  type QuickCreateTicketInput,
  type Ticket,
  type UpdateTicketInput
} from "@projectproject/shared"

const encodeQueryForKey = Schema.encodeSync(TicketListQuery)

export const ticketsListKey = (
  orgSlug: string,
  slug: string,
  query: TicketListQuery
): string => {
  const encoded = encodeQueryForKey(query)
  return `${orgSlug}/${slug}/${JSON.stringify(encoded)}`
}

interface ParsedTicketsListKey {
  readonly orgSlug: string
  readonly slug: string
  readonly query: TicketListQuery
}

const decodeQueryFromKey = Schema.decodeUnknownSync(TicketListQuery)

const parseTicketsListKey = (key: string): ParsedTicketsListKey => {
  const firstSlash = key.indexOf("/")
  const secondSlash = key.indexOf("/", firstSlash + 1)
  const orgSlug = key.slice(0, firstSlash)
  const slug = key.slice(firstSlash + 1, secondSlash)
  const raw = JSON.parse(key.slice(secondSlash + 1)) as unknown
  const query = decodeQueryFromKey(raw)
  return { orgSlug, slug, query }
}

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
  const { orgSlug, slug, query } = parseTicketsListKey(key)
  return runtime
    .subscriptionRef(
      Effect.gen(function* () {
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
    Effect.fn(function* (input: QuickCreateTicketInput, get) {
      const client = yield* ApiClient
      const ticket = yield* client.tickets.quickCreate({
        path: { orgSlug, slug },
        payload: input
      })
      get.refresh(ticketsListBaseAtom(ticketsListKey(orgSlug, slug)))
      return ticket
    })
  )
})

export const updateTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  const listKey = ticketsListKey(orgSlug, slug)
  return Atom.optimisticFn(ticketsListAtom(listKey), {
    reducer: (current, input: UpdateTicketInput) => {
      if (!Result.isSuccess(current)) return current
      const now = DateTime.toDate(DateTime.unsafeNow())
      const next = current.value.map((t) => {
        if (t.id !== id) return t
        return {
          ...t,
          title: input.title ?? t.title,
          status: input.status ?? t.status,
          type: input.type ?? t.type,
          priority: input.priority ?? t.priority,
          tags: input.tags ?? t.tags,
          assignees: input.assignees ?? t.assignees,
          updatedAt: now
        }
      })
      return Result.success(next, { waiting: true })
    },
    fn: runtime.fn(
      Effect.fn(function* (input: UpdateTicketInput, get) {
        const client = yield* ApiClient
        const updated = yield* client.tickets.update({
          path: { orgSlug, slug, id },
          payload: input
        })
        get.refresh(ticketBaseAtom(ticketKey(orgSlug, slug, id)))
        get.refresh(ticketsListBaseAtom(listKey))
        return updated
      })
    )
  })
})

export const deleteTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  return runtime.fn(
    Effect.fn(function* (_input: void, get) {
      const client = yield* ApiClient
      yield* client.tickets.delete({ path: { orgSlug, slug, id } })
      get.refresh(ticketsListBaseAtom(ticketsListKey(orgSlug, slug)))
    })
  )
})
