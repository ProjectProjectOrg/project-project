import type { TicketId, TicketListSource } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import { query } from "@/api/query"
import { localSequence } from "@/features/local/atoms/localViews"
import { readLocal } from "@/features/local/atoms/readLocal"

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

const sequenceQuery = (req: TicketSequenceRequest) =>
  query("tickets", "sequence", {
    params: req.params,
    query: { from: req.from },
    timeToLive: "2 minutes"
  })

export const ticketSequence = Atom.family((req: TicketSequenceRequest) =>
  Atom.readable(
    (get) => {
      const local = readLocal(get, req.params, () => localSequence(req))
      return local === null
        ? get(sequenceQuery(req))
        : AsyncResult.map(local, (found) => found.sequence)
    },
    (refresh) => refresh(sequenceQuery(req))
  )
)
