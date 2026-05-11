import { Atom } from "@effect-atom/atom-react"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import {
  TicketId,
  type CreateTicketInput,
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

export const ticketsListAtom = Atom.family((key: string) => {
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

export const ticketKey = (orgSlug: string, slug: string, id: TicketId) =>
  `${orgSlug}/${slug}/${id}`

export const ticketAtom = Atom.family((key: string) => {
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

export const createTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug } = splitProjectKey(key)
  return runtime.fn(
    Effect.fn(function* (input: CreateTicketInput, get) {
      const client = yield* ApiClient
      const ticket = yield* client.tickets.create({
        path: { orgSlug, slug },
        payload: input
      })
      get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
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
      get.refresh(ticketAtom(ticketKey(orgSlug, slug, id)))
      get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
      return updated
    })
  )
})

export const deleteTicketAtom = Atom.family((key: string) => {
  const { orgSlug, slug, id } = splitTicketKey(key)
  return runtime.fn(
    Effect.fn(function* (_input: void, get) {
      const client = yield* ApiClient
      yield* client.tickets.delete({ path: { orgSlug, slug, id } })
      get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
    })
  )
})
