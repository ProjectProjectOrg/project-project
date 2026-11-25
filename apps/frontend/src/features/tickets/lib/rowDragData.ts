import { TicketId, TicketPriority, TicketRank, TypeKey } from "@pp/shared"
import * as Schema from "effect/Schema"

const DraggedRowData = Schema.Struct({
  id: TicketId,
  ticketType: Schema.NullOr(TypeKey),
  subTicketCount: Schema.Number,
  rank: TicketRank,
  section: Schema.String
})

export const RowDragData = Schema.TaggedStruct("list-row", {
  title: Schema.String,
  priority: TicketPriority,
  rows: Schema.NonEmptyArray(DraggedRowData)
})
export const isRowDragData = Schema.is(RowDragData)
