import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api"
import * as Schema from "effect/Schema"

import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import { Conflict, MentionInvalid, Validation } from "../errors"
import { TicketPath } from "../http/paths"
import { Slug } from "../projects/Project"
import { TicketId } from "../tickets/Ticket"
import { Comment, CreateCommentInput, UpdateCommentInput } from "./Comment"
import { CommentId } from "./CommentId"

const TicketCommentPath = Schema.Struct({
  orgSlug: Slug,
  slug: Slug,
  id: TicketId,
  commentId: CommentId
})

export const TicketCommentsGroup = HttpApiGroup.make("ticketComments")
  .add(
    HttpApiEndpoint.get(
      "list",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/comments",
      {
        params: TicketPath,
        success: Schema.Array(Comment)
      }
    ).annotate(RequiresProject, { ticket: ["read"] })
  )
  .add(
    HttpApiEndpoint.post(
      "create",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/comments",
      {
        params: TicketPath,
        payload: CreateCommentInput,
        success: Comment,
        error: [Validation, MentionInvalid, Conflict]
      }
    ).annotate(RequiresProject, { comment: ["create"] })
  )
  .add(
    HttpApiEndpoint.patch(
      "update",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/comments/:commentId",
      {
        params: TicketCommentPath,
        payload: UpdateCommentInput,
        success: Comment,
        error: [Validation, MentionInvalid]
      }
    ).annotate(RequiresProject, "membership")
  )
  .add(
    HttpApiEndpoint.put(
      "resolve",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/comments/:commentId/resolution",
      {
        params: TicketCommentPath,
        success: Comment
      }
    ).annotate(RequiresProject, { comment: ["create"] })
  )
  .add(
    HttpApiEndpoint.delete(
      "unresolve",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/comments/:commentId/resolution",
      {
        params: TicketCommentPath,
        success: Comment
      }
    ).annotate(RequiresProject, { comment: ["create"] })
  )
  .add(
    HttpApiEndpoint.delete(
      "delete",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/comments/:commentId",
      {
        params: TicketCommentPath,
        success: HttpApiSchema.NoContent
      }
    ).annotate(RequiresProject, "membership")
  )
  .middleware(ProjectAccess)
  .middleware(Authentication)
