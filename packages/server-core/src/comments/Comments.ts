import type {
  Comment,
  CommentId,
  CreateCommentInput,
  Forbidden,
  MentionInvalid,
  NotFound,
  TicketId,
  UpdateCommentInput
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import type { MarkdownError } from "../markdown/Markdown"
import type { MalformedTicketDocument } from "../tickets/TicketDocs"

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
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: TicketId
  ) => Effect.Effect<
    ReadonlyArray<Comment>,
    NotFound | MarkdownError | MalformedTicketDocument
  >
  create: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: TicketId,
    input: CreateCommentInput
  ) => Effect.Effect<
    Comment,
    | NotFound
    | InvalidCommentBody
    | MentionInvalid
    | MarkdownError
    | MalformedTicketDocument
  >
  importHistorical: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: TicketId,
    input: ReadonlyArray<HistoricalCommentInput>
  ) => Effect.Effect<
    ReadonlyArray<Comment>,
    | NotFound
    | InvalidCommentBody
    | InvalidCommentAuthor
    | MentionInvalid
    | MarkdownError
    | MalformedTicketDocument
  >
  edit: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: TicketId,
    commentId: CommentId,
    input: UpdateCommentInput
  ) => Effect.Effect<
    Comment,
    | NotFound
    | Forbidden
    | InvalidCommentBody
    | MentionInvalid
    | MarkdownError
    | MalformedTicketDocument
  >
  remove: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: TicketId,
    commentId: CommentId
  ) => Effect.Effect<
    void,
    NotFound | Forbidden | MarkdownError | MalformedTicketDocument
  >
}>

export class Comments extends Context.Service<Comments, CommentsShape>()(
  "@pp/server-core/comments/Comments"
) {}
