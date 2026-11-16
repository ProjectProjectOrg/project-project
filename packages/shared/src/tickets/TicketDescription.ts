import * as Schema from "effect/Schema"

import { SyncCursor } from "../sync/ProjectSync"
import { TicketId } from "./Ticket"

export const TicketDescription = Schema.Struct({
  id: TicketId,
  body: Schema.String,
  revision: SyncCursor.annotate({
    description:
      "The change-log position of the last change to this description, `0.0` when it has not changed since the log began."
  }),
  missingAttachments: Schema.Array(Schema.String)
})
export type TicketDescription = typeof TicketDescription.Type

export const TICKET_DESCRIPTIONS_MAX = 100

export const TicketDescriptionsQuery = Schema.Struct({
  ids: Schema.Array(TicketId).pipe(
    Schema.check(Schema.isMaxLength(TICKET_DESCRIPTIONS_MAX))
  )
})

export const UpdateTicketDescriptionInput = Schema.Struct({
  body: Schema.String,
  base: SyncCursor.annotate({
    description:
      "The revision the edit started from. A description changed since then fails with `Conflict` `description_changed`."
  })
})
export type UpdateTicketDescriptionInput =
  typeof UpdateTicketDescriptionInput.Type

const positionOf = (revision: SyncCursor): readonly [number, number] => {
  const [generation = 0, sequence = 0] = revision.split(".").map(Number)
  return [generation, sequence]
}

export const compareDescriptionRevisions = (
  a: SyncCursor,
  b: SyncCursor
): number => {
  const [ag, as] = positionOf(a)
  const [bg, bs] = positionOf(b)
  return ag === bg ? as - bs : ag - bg
}
