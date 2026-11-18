import * as Schema from "effect/Schema"

// What a board drags and where it drops (see components/board-drag.tsx).

export const BoardCardDragData = Schema.TaggedStruct("card", {
  id: Schema.String,
  status: Schema.String
})
export type BoardCardDragData = typeof BoardCardDragData.Type

export const BoardCardDropData = Schema.TaggedStruct("card", {
  id: Schema.String,
  status: Schema.String,
  edge: Schema.Literals(["top", "bottom"])
})
export type BoardCardDropData = typeof BoardCardDropData.Type

export const BoardColumnDropData = Schema.TaggedStruct("column", {
  status: Schema.String
})
export type BoardColumnDropData = typeof BoardColumnDropData.Type

export const BoardDropData = Schema.Union([
  BoardCardDropData,
  BoardColumnDropData
]).pipe(Schema.toTaggedUnion("_tag"))
export type BoardDropData = typeof BoardDropData.Type

const isCardDrop = Schema.is(BoardCardDropData)
const isCardShape = Schema.is(BoardCardDragData)
// A dragged card, not a card's drop target (which also carries an edge).
export const isBoardCardDrag = (value: unknown): value is BoardCardDragData =>
  isCardShape(value) && !isCardDrop(value)
export const isBoardDrop = Schema.is(BoardDropData)

// A card's slot in its list carries this attribute: the card's drop target
// and the gap's height are measured on it.
export const boardSlotAttribute = "data-board-slot"
