import { Atom } from "@effect-atom/atom-react"
import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import type {
  CreateTicketInput,
  TicketId,
  UpdateTicketInput
} from "@projectproject/shared"

// One list atom per project slug. Refreshed by create/update/delete fns.
export const ticketsListAtom = Atom.family((slug: string) =>
  runtime
    .atom(
      Effect.gen(function*() {
        const client = yield* ApiClient
        return yield* client.tickets.list({ path: { slug } })
      })
    )
    .pipe(Atom.setIdleTTL("1 minute"))
)

// One detail atom per (slug, id). Family keys are primitive — encode the
// pair as `${slug}/${id}` and split on the first slash inside.
export const ticketAtom = Atom.family((key: string) => {
  const idx = key.indexOf("/")
  const slug = key.slice(0, idx)
  const id = key.slice(idx + 1) as TicketId
  return runtime
    .atom(
      Effect.gen(function*() {
        const client = yield* ApiClient
        return yield* client.tickets.get({ path: { slug, id } })
      })
    )
    .pipe(Atom.setIdleTTL("2 minutes"))
})

export const ticketKey = (slug: string, id: TicketId) => `${slug}/${id}`

export const createTicketAtom = runtime.fn(
  Effect.fn(function*(
    input: { slug: string } & CreateTicketInput,
    get
  ) {
    const client = yield* ApiClient
    const { slug, ...payload } = input
    const ticket = yield* client.tickets.create({
      path: { slug },
      payload
    })
    get.refresh(ticketsListAtom(slug))
    return ticket
  })
)

export const updateTicketAtom = runtime.fn(
  Effect.fn(function*(
    input: { slug: string; id: TicketId } & UpdateTicketInput,
    get
  ) {
    const client = yield* ApiClient
    const { slug, id, ...payload } = input
    const updated = yield* client.tickets.update({
      path: { slug, id },
      payload
    })
    get.refresh(ticketAtom(ticketKey(slug, id)))
    get.refresh(ticketsListAtom(slug))
    return updated
  })
)

export const deleteTicketAtom = runtime.fn(
  Effect.fn(function*(input: { slug: string; id: TicketId }, get) {
    const client = yield* ApiClient
    yield* client.tickets.delete({
      path: { slug: input.slug, id: input.id }
    })
    get.refresh(ticketsListAtom(input.slug))
  })
)
