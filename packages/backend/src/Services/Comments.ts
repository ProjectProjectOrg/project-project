import { Context, type Effect } from "effect"
import type {
  Comment,
  CommentId,
  CreateCommentInput,
  Forbidden,
  NotFound,
  TicketId,
  UpdateCommentInput
} from "@projectproject/shared"
import type { MarkdownError } from "./Markdown"

export interface CommentsShape {
  readonly list: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: TicketId
  ) => Effect.Effect<ReadonlyArray<Comment>, NotFound | MarkdownError>
  readonly create: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: TicketId,
    input: CreateCommentInput
  ) => Effect.Effect<Comment, NotFound | MarkdownError>
  readonly edit: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: TicketId,
    commentId: CommentId,
    input: UpdateCommentInput
  ) => Effect.Effect<Comment, NotFound | Forbidden | MarkdownError>
  readonly remove: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: TicketId,
    commentId: CommentId
  ) => Effect.Effect<void, NotFound | Forbidden | MarkdownError>
}

export class Comments extends Context.Tag("Comments")<
  Comments,
  CommentsShape
>() {}
