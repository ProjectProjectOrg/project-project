// Ticket schema — over-the-wire shape returned by /projects/:slug/tickets endpoints.
//
// Tickets are stored as markdown files at
// `<PROJECTS_DIR>/orgs/<org-slug>/projects/<project-slug>/tickets/<ticket-id>.md`.
// The frontmatter is the structured data the API returns; the body is the description.
//
// IDs are sequential per project: T-1, T-2, ... — assigned by the server.

import { Schema } from "effect"

export const TicketId = Schema.String.pipe(
  Schema.pattern(/^T-[1-9][0-9]*$/),
  Schema.brand("TicketId")
)
export type TicketId = typeof TicketId.Type

export const TicketStatus = Schema.Literal("todo", "in_progress", "done")
export type TicketStatus = typeof TicketStatus.Type

export const TicketType = Schema.Literal("feat", "bug", "chore", "other")
export type TicketType = typeof TicketType.Type

export const Ticket = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: TicketStatus,
  type: TicketType,
  branch: Schema.NullOr(Schema.String),
  // The PR number observed for this ticket's branch. Updated by the server
  // whenever a `git_states` fetch sees a PR for `branch`. Null while the
  // branch has no PR.
  pr: Schema.NullOr(Schema.Number),
  // Idempotency key for the auto-status transition: set to the PR number we
  // last auto-flipped to `done`. If the user manually moves status back to
  // `in_progress`, we won't reflip because `pr === lastTransitionedPr`.
  lastTransitionedPr: Schema.NullOr(Schema.Number),
  assignees: Schema.Array(Schema.String),
  createdBy: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date
})
export type Ticket = typeof Ticket.Type

export const TicketDetail = Schema.Struct({
  ...Ticket.fields,
  body: Schema.String
})
export type TicketDetail = typeof TicketDetail.Type

export const CreateTicketInput = Schema.Struct({
  title: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200)),
  type: Schema.optional(TicketType)
})
export type CreateTicketInput = typeof CreateTicketInput.Type

export const UpdateTicketInput = Schema.Struct({
  title: Schema.optional(
    Schema.String.pipe(Schema.minLength(1), Schema.maxLength(200))
  ),
  status: Schema.optional(TicketStatus),
  type: Schema.optional(TicketType),
  assignees: Schema.optional(Schema.Array(Schema.String)),
  body: Schema.optional(Schema.String)
})
export type UpdateTicketInput = typeof UpdateTicketInput.Type
