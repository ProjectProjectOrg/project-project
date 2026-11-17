import type { TicketId, TicketListSource } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { localSequence } from "@/features/local/atoms/localViews"
import { localValue } from "@/features/local/atoms/readLocal"

export type TicketSequenceRequest = Readonly<{
  _view: "ticketSequence"
  params: Readonly<{ orgSlug: string; slug: string; id: TicketId }>
  from: TicketListSource | undefined
}>

export const ticketSequenceRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId,
  from: TicketListSource | undefined
): TicketSequenceRequest => ({
  _view: "ticketSequence",
  params: { orgSlug, slug, id },
  from
})

export const ticketSequence = Atom.family((req: TicketSequenceRequest) =>
  Atom.make((get) =>
    AsyncResult.map(
      localValue(get(localSequence(req))),
      (found) => found.sequence
    )
  )
)
