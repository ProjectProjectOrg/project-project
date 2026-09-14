import * as Schema from "effect/Schema"
import { User } from "./User"
import { TicketId } from "./Ticket"
import { Slug } from "./Project"

export const CommentId = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^c_[A-Za-z0-9_-]+$/)),
  Schema.brand("CommentId")
)
export type CommentId = typeof CommentId.Type

export const CommentAuthor = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("user"),
    user: User
  }),
  Schema.Struct({
    kind: Schema.Literal("jira"),
    displayName: Schema.NonEmptyString,
    accountId: Schema.NonEmptyString
  })
])
export type CommentAuthor = typeof CommentAuthor.Type

export const CommentOrigin = Schema.Literals(["native", "jira"])
export type CommentOrigin = typeof CommentOrigin.Type

export const Comment = Schema.Struct({
  id: CommentId,
  ticketId: TicketId,
  projectSlug: Slug,
  author: CommentAuthor,
  origin: CommentOrigin,
  body: Schema.String,
  createdAt: Schema.DateFromString,
  editedAt: Schema.NullOr(Schema.DateFromString)
})
export type Comment = typeof Comment.Type

export const CreateCommentInput = Schema.Struct({
  body: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(20_000))
  )
})
export type CreateCommentInput = typeof CreateCommentInput.Type

export const UpdateCommentInput = Schema.Struct({
  body: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(20_000))
  )
})
export type UpdateCommentInput = typeof UpdateCommentInput.Type
