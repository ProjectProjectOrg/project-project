import * as Struct from "effect/Struct"

import type { TicketDocument } from "./TicketDocs"

const prMetadataKeys = [
  "pr",
  "prState",
  "prDraft",
  "lastTransitionedPr",
  "stack"
] as const

export const prMetadataOf = (ticket: TicketDocument) =>
  Struct.pick(ticket, prMetadataKeys)

export const hasPrMetadata = (ticket: TicketDocument): boolean =>
  ticket.pr !== null ||
  ticket.prState !== null ||
  ticket.lastTransitionedPr !== null ||
  (ticket.stack ?? []).some(
    (layer) =>
      layer.pr !== undefined ||
      layer.prState !== undefined ||
      layer.prDraft === true ||
      layer.landed === true
  )

export const clearedPrMetadata = (ticket: TicketDocument): TicketDocument => ({
  ...ticket,
  pr: null,
  prState: null,
  prDraft: false,
  lastTransitionedPr: null,
  stack: ticket.stack?.map((layer) => Struct.pick(layer, ["branch", "base"]))
})
