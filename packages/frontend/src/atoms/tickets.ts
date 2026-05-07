import { Atom } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import type {
  CreateTicketInput,
  DeleteTicketInput,
  TicketId,
  UpdateTicketInput
} from "@projectproject/shared"

// Family keys are primitive strings. Slugs and ticket ids are URL-safe
// (no `/`), so a slash is an unambiguous separator.

export const ticketsListKey = (orgSlug: string, slug: string) =>
  `${orgSlug}/${slug}`

export const ticketsListAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const orgSlug = key.slice(0, idx)
  const slug = key.slice(idx + 1)
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
  const parts = key.split("/")
  const orgSlug = parts[0]
  const slug = parts[1]
  const id = parts.slice(2).join("/") as TicketId
  return runtime
    .atom(
      Effect.gen(function* () {
        const client = yield* ApiClient
        return yield* client.tickets.get({ path: { orgSlug, slug, id } })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
})

export const createTicketAtom = runtime.fn(
  Effect.fn(function* (
    input: { orgSlug: string; slug: string } & CreateTicketInput,
    get
  ) {
    const client = yield* ApiClient
    const { orgSlug, slug, ...payload } = input
    const ticket = yield* client.tickets.create({
      path: { orgSlug, slug },
      payload
    })
    get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
    return ticket
  })
)

export const updateTicketAtom = runtime.fn(
  Effect.fn(function* (
    input: {
      orgSlug: string
      slug: string
      id: TicketId
    } & UpdateTicketInput,
    get
  ) {
    const client = yield* ApiClient
    const { orgSlug, slug, id, ...payload } = input
    const updated = yield* client.tickets.update({
      path: { orgSlug, slug, id },
      payload
    })
    get.refresh(ticketAtom(ticketKey(orgSlug, slug, id)))
    get.refresh(ticketsListAtom(ticketsListKey(orgSlug, slug)))
    return updated
  })
)

export const deleteTicketAtom = runtime.fn(
  Effect.fn(function* (
    input: { orgSlug: string; slug: string; id: TicketId } & DeleteTicketInput,
    get
  ) {
    const client = yield* ApiClient
    yield* client.tickets.delete({
      path: { orgSlug: input.orgSlug, slug: input.slug, id: input.id },
      payload: { baseVersion: input.baseVersion }
    })
    get.refresh(ticketsListAtom(ticketsListKey(input.orgSlug, input.slug)))
  })
)

export const fetchTicketAtom = runtime.fn(
  Effect.fn(function* (input: { orgSlug: string; slug: string; id: TicketId }) {
    const client = yield* ApiClient
    return yield* client.tickets.get({
      path: { orgSlug: input.orgSlug, slug: input.slug, id: input.id }
    })
  })
)
