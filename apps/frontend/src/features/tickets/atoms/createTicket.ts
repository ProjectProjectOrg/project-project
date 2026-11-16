import type {
  CreateTicketInput,
  GroupId,
  MarkKind,
  TicketId,
  TypeKey
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"

import { Api } from "@/api/Api"
import { Keys, projectScope } from "@/api/keys"

export type CreateTicketRequest = Readonly<{
  orgSlug: string
  projectSlug: string | null
  sprint?: GroupId
  type?: TypeKey
  title?: string
  related?: RelatedTo
}>

export type RelatedKind = MarkKind | "subTicket"

export type RelatedTo = Readonly<{ kind: RelatedKind; ticketId: TicketId }>

const RELATED_PAYLOADS: Readonly<
  Record<RelatedKind, (id: TicketId) => Partial<CreateTicketInput>>
> = {
  subTicket: (id) => ({ parent: id }),
  blocking: (id) => ({ blockedBy: [id] }),
  related: (id) => ({ relatedTo: [id] }),
  blockedBy: () => ({})
}

export const relatedPayload = (
  related: RelatedTo | null
): Partial<CreateTicketInput> =>
  related === null ? {} : RELATED_PAYLOADS[related.kind](related.ticketId)

// What the next "New ticket" should start from (project, sprint, a ticket
// it relates to, a title already typed): set by a command or menu before it
// opens the cmd+k page or the composer popover.
export const newTicketRequest = Atom.make<CreateTicketRequest | null>(
  null
).pipe(Atom.keepAlive)

export type CreateTicketDialogInput = Readonly<{
  orgSlug: string
  slug: string
  payload: CreateTicketInput
}>

export const createTicketInProject = Api.runtime.fn(
  Effect.fn("createTicketInProject")(function* (
    input: CreateTicketDialogInput
  ) {
    const created = yield* Api.use((client) =>
      client.tickets.create({
        params: { orgSlug: input.orgSlug, slug: input.slug },
        payload: input.payload
      })
    )
    yield* Reactivity.invalidate(
      Keys.ticketsChanged(projectScope(input.orgSlug, input.slug))
    )
    return created
  })
)
