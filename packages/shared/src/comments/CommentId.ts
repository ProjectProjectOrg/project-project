import * as Schema from "effect/Schema"

export const CommentId = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^c_[A-Za-z0-9_-]+$/u)),
  Schema.brand("CommentId")
)
export type CommentId = typeof CommentId.Type
