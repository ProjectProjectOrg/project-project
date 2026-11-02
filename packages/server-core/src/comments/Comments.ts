import type {
  ActivityActor,
  Comment,
  CommentId,
  CreateCommentInput,
  MentionInvalid,
  NotFound,
  TicketId,
  UpdateCommentInput,
  ProjectScope,
  Forbidden
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import type * as Markdown from "../markdown/Markdown"
import type * as TicketDocs from "../tickets/TicketDocs"

export class InvalidCommentBody extends Data.TaggedError("InvalidCommentBody")<{
  readonly reason: string
}> {}

export class InvalidCommentAuthor extends Data.TaggedError(
  "InvalidCommentAuthor"
)<{
  readonly reason: string
}> {}

export const HistoricalCommentAuthor = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("user"),
    userId: Schema.NonEmptyString
  }),
  Schema.Struct({
    kind: Schema.Literal("jira"),
    displayName: Schema.NonEmptyString,
    accountId: Schema.NonEmptyString
  })
])
export type HistoricalCommentAuthor = typeof HistoricalCommentAuthor.Type

export type HistoricalCommentInput = Readonly<{
  author: HistoricalCommentAuthor
  body: string
  createdAt: Date
  editedAt: Date | null
}>

export type CommentsShape = Readonly<{
  list: (
    ticketId: TicketId
  ) => Effect.Effect<
    ReadonlyArray<Comment>,
    NotFound | Markdown.MarkdownError | TicketDocs.MalformedTicketDocument,
    ProjectScope
  >
  create: (
    ticketId: TicketId,
    input: CreateCommentInput
  ) => Effect.Effect<
    Comment,
    | NotFound
    | InvalidCommentBody
    | MentionInvalid
    | Markdown.MarkdownError
    | TicketDocs.MalformedTicketDocument,
    ProjectScope | ActivityActor
  >
  importHistorical: (
    ticketId: TicketId,
    input: ReadonlyArray<HistoricalCommentInput>
  ) => Effect.Effect<
    ReadonlyArray<Comment>,
    | NotFound
    | InvalidCommentBody
    | InvalidCommentAuthor
    | MentionInvalid
    | Markdown.MarkdownError
    | TicketDocs.MalformedTicketDocument,
    ProjectScope | ActivityActor
  >
  edit: (
    ticketId: TicketId,
    commentId: CommentId,
    input: UpdateCommentInput
  ) => Effect.Effect<
    Comment,
    | Forbidden
    | NotFound
    | InvalidCommentBody
    | MentionInvalid
    | Markdown.MarkdownError
    | TicketDocs.MalformedTicketDocument,
    ProjectScope | ActivityActor
  >
  remove: (
    ticketId: TicketId,
    commentId: CommentId
  ) => Effect.Effect<
    void,
    | Forbidden
    | NotFound
    | Markdown.MarkdownError
    | TicketDocs.MalformedTicketDocument,
    ProjectScope | ActivityActor
  >
}>

export class Comments extends Context.Service<Comments, CommentsShape>()(
  "@pp/server-core/comments/Comments"
) {}
