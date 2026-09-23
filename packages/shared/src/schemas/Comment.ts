import * as Schema from "effect/Schema"

import { Slug } from "./Project"
import { TicketId } from "./Ticket"
import { User } from "./User"

export const CommentId = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^c_[A-Za-z0-9_-]+$/)),
  Schema.brand("CommentId")
)
export type CommentId = typeof CommentId.Type

const UserCommentAuthor = Schema.Struct({
  kind: Schema.Literal("user"),
  user: User
})
const JiraCommentAuthor = Schema.Struct({
  kind: Schema.Literal("jira"),
  displayName: Schema.NonEmptyString,
  accountId: Schema.NonEmptyString
})

export const CommentAuthor = Schema.Union([
  UserCommentAuthor,
  JiraCommentAuthor
])
export type CommentAuthor = typeof CommentAuthor.Type

export const CommentOrigin = Schema.Literals(["native", "jira"])
export type CommentOrigin = typeof CommentOrigin.Type

const CommentFields = {
  id: CommentId,
  ticketId: TicketId,
  projectSlug: Slug,
  body: Schema.String,
  createdAt: Schema.DateFromString,
  editedAt: Schema.NullOr(Schema.DateFromString)
}

export const Comment = Schema.Union([
  Schema.Struct({
    ...CommentFields,
    author: UserCommentAuthor,
    origin: Schema.Literal("native")
  }),
  Schema.Struct({
    ...CommentFields,
    author: CommentAuthor,
    origin: Schema.Literal("jira")
  })
])
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
