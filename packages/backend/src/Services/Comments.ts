import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import type {
  Comment,
  CommentId,
  CreateCommentInput,
  Forbidden,
  MentionInvalid,
  NotFound,
  TicketId,
  UpdateCommentInput
} from "@projectproject/shared"
import type { MarkdownError } from "./Markdown"
import type { MalformedTicketDocument } from "./TicketDocs"

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

export interface HistoricalCommentInput {
  readonly author: HistoricalCommentAuthor
  readonly body: string
  readonly createdAt: Date
  readonly editedAt: Date | null
}

export interface CommentsShape {
  readonly list: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: TicketId
  ) => Effect.Effect<
    ReadonlyArray<Comment>,
    NotFound | MarkdownError | MalformedTicketDocument
  >
  readonly create: (
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
  readonly importHistorical: (
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
  readonly edit: (
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
  readonly remove: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: TicketId,
    commentId: CommentId
  ) => Effect.Effect<
    void,
    NotFound | Forbidden | MarkdownError | MalformedTicketDocument
  >
}

export class Comments extends Context.Service<Comments, CommentsShape>()(
  "@projectproject/backend/Services/Comments"
) {}
