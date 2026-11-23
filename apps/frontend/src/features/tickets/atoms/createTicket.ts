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
  body?: string
  related?: RelatedTo
  fromComment?: NonNullable<CreateTicketInput["fromComment"]>
  // Set by an inline new-ticket field's "Add details": the ticket lands in
  // that list, so the page stays.
  from?: "inline"
}>

export type RelatedKind = MarkKind | "subTicket" | "epicOf"

export type RelatedTo = Readonly<{ kind: RelatedKind; ticketId: TicketId }>

const RELATED_PAYLOADS: Readonly<
  Record<RelatedKind, (id: TicketId) => Partial<CreateTicketInput>>
> = {
  subTicket: (id) => ({ parent: id }),
  blocking: (id) => ({ blockedBy: [id] }),
  related: (id) => ({ relatedTo: [id] }),
  blockedBy: () => ({}),
  epicOf: () => ({})
}

export const relatedPayload = (related: RelatedTo | null) =>
  related === null ? {} : RELATED_PAYLOADS[related.kind](related.ticketId)

// What the next "New ticket" should start from (project, sprint, a ticket
// it relates to, a title already typed): set by a command or menu before it
// opens the cmd+k page or the composer popover.
// The ticket just created on this page, so its list can scroll to it and
// flash it. `at` is a performance.now() time; lists ignore it once stale.
export type JustCreatedTicket = Readonly<{ id: TicketId; at: number }>

export const justCreatedTicket = Atom.make<JustCreatedTicket | null>(null).pipe(
  Atom.keepAlive
)

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
    const scope = projectScope(input.orgSlug, input.slug)
    yield* Reactivity.invalidate([
      ...Keys.ticketChanged(scope, created.id),
      ...(created.parent ? [Keys.ticket(scope, created.parent.id)] : []),
      ...(input.payload.fromComment
        ? [Keys.comments(scope, input.payload.fromComment.ticketId)]
        : [])
    ])
    return created
  })
)
