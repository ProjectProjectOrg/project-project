import type { TicketId, TicketListSource } from "@pp/shared"
import * as Atom from "effect/reactivity/Atom"

import { query } from "@/api/query"

export type TicketSequenceRequest = ReturnType<typeof ticketSequenceRequest>

export const ticketSequenceRequest = (
  orgSlug: string,
  slug: string,
  id: TicketId,
  from: TicketListSource | undefined
) =>
  ({
    _view: "ticketSequence",
    params: { orgSlug, slug, id },
    from
  }) as const

export const ticketSequence = Atom.family((req: TicketSequenceRequest) =>
  query("tickets", "sequence", {
    params: req.params,
    query: { from: req.from },
    timeToLive: "2 minutes"
  })
)
