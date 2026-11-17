import * as Schema from "effect/Schema"

import { User } from "../auth/User"
import { Slug } from "../projects/Project"
import { TicketId } from "../tickets/Ticket"
import { CommentId } from "./CommentId"

const UserCommentAuthor = Schema.Struct({
  kind: Schema.Literal("user"),
  user: User
})
export const ImportedSource = Schema.Literals(["jira", "projectproject"])
export type ImportedSource = typeof ImportedSource.Type

export const ImportedAuthor = Schema.Struct({
  kind: Schema.Literal("imported"),
  displayName: Schema.NonEmptyString,
  source: ImportedSource,
  sourceId: Schema.NonEmptyString
})
export type ImportedAuthor = typeof ImportedAuthor.Type

export const CommentAuthor = Schema.Union([UserCommentAuthor, ImportedAuthor])
export type CommentAuthor = typeof CommentAuthor.Type

export const CommentOrigin = Schema.Literals([
  "native",
  "jira",
  "projectproject"
])
export type CommentOrigin = typeof CommentOrigin.Type

const CommentFields = {
  id: CommentId,
  ticketId: TicketId,
  projectSlug: Slug,
  body: Schema.String,
  createdAt: Schema.DateFromString,
  editedAt: Schema.NullOr(Schema.DateFromString),
  replyTo: Schema.NullOr(CommentId),
  resolution: Schema.NullOr(
    Schema.Struct({ by: Schema.NullOr(User), at: Schema.DateFromString })
  ),
  tickets: Schema.Array(
    Schema.Struct({ projectSlug: Schema.NullOr(Slug), id: TicketId })
  )
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
    origin: Schema.Literals(["jira", "projectproject"])
  })
])
export type Comment = typeof Comment.Type

export const CreateCommentInput = Schema.Struct({
  body: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(20_000))
  ).annotate({
    description: "The comment as CommonMark markdown, 1 to 20,000 characters."
  }),
  replyTo: Schema.optionalKey(CommentId).annotate({
    description:
      "Reply in the thread of this comment. Replying to a reply adds to the same thread."
  })
})
export type CreateCommentInput = typeof CreateCommentInput.Type

export const UpdateCommentInput = Schema.Struct({
  body: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(20_000))
  )
})
export type UpdateCommentInput = typeof UpdateCommentInput.Type

export const ResolveCommentInput = Schema.Struct({
  resolved: Schema.Boolean.annotate({
    description: "true resolves the comment's thread, false reopens it."
  })
})
export type ResolveCommentInput = typeof ResolveCommentInput.Type
