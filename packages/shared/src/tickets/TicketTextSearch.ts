import * as Schema from "effect/Schema"

import { TicketId } from "./Ticket"

export const TicketTextSearchQuery = Schema.Struct({
  q: Schema.String.pipe(Schema.check(Schema.isMinLength(1))),
  limit: Schema.optional(
    Schema.FiniteFromString.pipe(
      Schema.check(Schema.isInt()),
      Schema.check(Schema.isBetween({ minimum: 1, maximum: 50 }))
    )
  )
})
export type TicketTextSearchQuery = typeof TicketTextSearchQuery.Type

export const TicketTitle = Schema.Struct({
  id: TicketId,
  title: Schema.String
})
export type TicketTitle = typeof TicketTitle.Type

export const TextRange = Schema.Tuple([Schema.Number, Schema.Number])
export type TextRange = typeof TextRange.Type

export const TicketTextSnippet = Schema.Struct({
  text: Schema.String,
  ranges: Schema.Array(TextRange)
})
export type TicketTextSnippet = typeof TicketTextSnippet.Type

export const TicketTextHit = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  match: Schema.Union([
    Schema.Struct({ where: Schema.Literal("title") }),
    Schema.Struct({
      where: Schema.Literal("description"),
      snippet: TicketTextSnippet
    }),
    Schema.Struct({
      where: Schema.Literal("comment"),
      author: Schema.String,
      snippet: TicketTextSnippet
    })
  ])
})
export type TicketTextHit = typeof TicketTextHit.Type
