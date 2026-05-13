import { Atom, Result } from "@effect-atom/atom-react"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import {
  TicketId,
  type CreateTicketInput,
  type TicketDetail,
  type UpdateTicketInput
} from "@projectproject/shared"

// Family keys are primitive strings. Slugs and ticket ids are URL-safe
// (no `/`), so a slash is an unambiguous separator.

export const ticketsListKey = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`

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

export const ticketsListBaseAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.tickets.list({ path: { orgSlug, slug } })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
})

export const ticketsListAtom = Atom.family((key: string) =>
  Atom.optimistic(ticketsListBaseAtom(key))
)

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

export const ticketAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  const listKey = ticketsListKey(orgSlug, slug)
  return Atom.readable((get) => {
    const base = get(ticketBaseAtom(key))
    if (!Result.isSuccess(base)) return base
    const list = get(ticketsListAtom(listKey))
    if (Result.isSuccess(list)) {
      const fromList = list.value.find((t) => t.id === id)
      if (fromList) {
        const merged: TicketDetail = { ...fromList, body: base.value.body }
        const waiting = base.waiting || list.waiting
        return waiting
          ? Result.success(merged, { waiting: true })
          : Result.success(merged)
      }
    }
    return base
  })
})

export const createTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime.fn(
    Effect.fn(function* (input: CreateTicketInput, get) {
      const client = yield* ApiClient
      const ticket = yield* client.tickets.create({
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
