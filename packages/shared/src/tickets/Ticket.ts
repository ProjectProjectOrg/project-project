// Ticket schema — over-the-wire shape returned by /projects/:slug/tickets endpoints.
//
// Tickets are stored as markdown files at
// `<PROJECTS_DIR>/orgs/<org-slug>/projects/<project-slug>/tickets/<ticket-id>.md`.
// The frontmatter is the structured data the API returns; the body is the description.
//

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { User } from "../auth/User"
import { Estimate, ESTIMATE_MAX_MINUTES } from "../estimates/Estimate"
import { GitState, StackLayerState } from "../github/GitState"
import { GroupId } from "../groups/GroupId"
import { TypeKey } from "../library/LibraryKey"
import { ProjectKey } from "../projects/Project"
import { StatusSlug } from "../statuses/Status"
import { TagName } from "../tags/Tag"

const isProjectKey = Schema.is(ProjectKey)

export const TicketId = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]*$/u)),
  Schema.check(
    Schema.makeFilter((id: string) => {
      const dash = id.lastIndexOf("-")
      if (dash < 0) return false
      return isProjectKey(id.slice(0, dash))
    })
  ),
  Schema.brand("TicketId")
)
export type TicketId = typeof TicketId.Type

export const TicketStatus = StatusSlug
export type TicketStatus = typeof TicketStatus.Type

export function isCarryover(
  status: TicketStatus,
  finished: ReadonlySet<string>
): boolean {
  return !finished.has(status)
}

export const TicketType = Schema.Literals([
  "feat",
  "bug",
  "chore",
  "other",
  "epic"
])
export type TicketType = typeof TicketType.Type

export const TicketParent = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  type: TicketType
})
export type TicketParent = typeof TicketParent.Type

export const TicketPriority = Schema.Literals(["low", "med", "high"])
export type TicketPriority = typeof TicketPriority.Type

export const PullRequestState = Schema.Literals(["open", "closed", "merged"])
export type PullRequestState = typeof PullRequestState.Type

export const TicketBranchEntry = Schema.Struct({
  branch: Schema.String,
  base: Schema.optionalKey(Schema.String),
  pr: Schema.optionalKey(Schema.Finite),
  prState: Schema.optionalKey(PullRequestState),
  prDraft: Schema.optionalKey(Schema.Boolean),
  landed: Schema.optionalKey(Schema.Boolean)
})
export type TicketBranchEntry = typeof TicketBranchEntry.Type

export const Ticket = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: TicketStatus,
  type: TicketType,
  priority: TicketPriority,
  estimate: Schema.NullOr(Estimate).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  tags: Schema.Array(TagName),
  branch: Schema.NullOr(Schema.String),
  // The PR number observed for this ticket's branch. Updated by the server
  // whenever a `git_states` fetch sees a PR for `branch`. Null while the
  // branch has no PR.
  pr: Schema.NullOr(Schema.Finite),
  prState: Schema.NullOr(PullRequestState),
  // Idempotency key for the auto-status transition: set to the PR number we
  // last auto-flipped to `done`. If the user manually moves status back to
  // `in_progress`, we won't reflip because `pr === lastTransitionedPr`.
  lastTransitionedPr: Schema.NullOr(Schema.Finite),
  gitState: GitState,
  assignees: Schema.Array(Schema.String),
  parent: Schema.NullOr(TicketParent).annotate({
    description:
      "The epic or ticket this ticket sits under, or `null`. Inputs take " +
      "only its `id`."
  }),
  subTicketCount: Schema.optional(Schema.Number),
  subTicketDoneCount: Schema.optional(Schema.Number),
  subTicketsInSection: Schema.optional(Schema.Number),
  openBlockerCount: Schema.optional(Schema.Number),
  openBlockingCount: Schema.optional(Schema.Number),
  relatedCount: Schema.optional(Schema.Number),
  duplicateCount: Schema.optional(Schema.Number),
  archivedAt: Schema.NullOr(Schema.DateFromString),
  createdBy: Schema.String,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString
})
export type Ticket = typeof Ticket.Type

export const LinkedTicket = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: TicketStatus,
  archivedAt: Schema.NullOr(Schema.DateFromString)
})
export type LinkedTicket = typeof LinkedTicket.Type

export const TicketRelations = Schema.Struct({
  blockedBy: Schema.Array(LinkedTicket),
  blocking: Schema.Array(LinkedTicket),
  related: Schema.Array(LinkedTicket),
  duplicateOf: Schema.NullOr(LinkedTicket),
  duplicates: Schema.Array(LinkedTicket)
})
export type TicketRelations = typeof TicketRelations.Type

export const EMPTY_TICKET_RELATIONS: TicketRelations = {
  blockedBy: [],
  blocking: [],
  related: [],
  duplicateOf: null,
  duplicates: []
}

export const MarkKind = Schema.Literals(["blockedBy", "blocking", "related"])
export type MarkKind = typeof MarkKind.Type

export const MarkTicketInput = Schema.Struct({
  kind: MarkKind.annotate({
    description:
      "`blockedBy`: this ticket can't start until `target` is done. `blocking`: `target` can't start until this ticket is done. `related`: the two tickets are related."
  }),
  target: TicketId.annotate({
    description: "The id of the other ticket, in the same project."
  })
})
export type MarkTicketInput = typeof MarkTicketInput.Type

export const TicketDetail = Schema.Struct({
  ...Ticket.fields,
  stack: Schema.optional(Schema.Array(StackLayerState)),
  splitFrom: Schema.optional(Schema.NullOr(TicketId)),
  relations: TicketRelations.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(EMPTY_TICKET_RELATIONS))
  ),
  creator: Schema.NullOr(User),
  updater: Schema.NullOr(User),
  body: Schema.String,
  missingAttachments: Schema.optional(Schema.Array(Schema.String))
})
export type TicketDetail = typeof TicketDetail.Type

export const QuickCreateTicketInput = Schema.Struct({
  title: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(200))
  ),
  type: Schema.optional(TicketType),
  status: Schema.optional(TicketStatus),
  parent: Schema.optional(TicketId),
  template: Schema.optional(Schema.NullOr(TypeKey))
})
export type QuickCreateTicketInput = typeof QuickCreateTicketInput.Type

const ticketFieldDocs = {
  status: "A status slug from `list_statuses` (default `todo`).",
  type: "The ticket type (default `other`).",
  priority: "The priority (default `med`).",
  estimate:
    "An estimate in the project's estimation unit (`estimation` in `get_project`): " +
    '`{ unit: "points", value: 1-999 }`, `{ unit: "tshirt", value: "XS" | "S" | "M" | "L" | "XL" }` ' +
    `or \`{ unit: "time", minutes: 1-${ESTIMATE_MAX_MINUTES} }\`; \`null\` clears it.`,
  tags: "Tag names; each must exist on the project (`list_tags`).",
  assignees: "User ids of project members (`list_members`).",
  body: "The description as CommonMark markdown, which may contain named blocks.",
  parent:
    "The id of an epic (making this one of its tickets) or of a ticket (making this a sub-ticket).",
  blockedBy:
    "Ids of tickets in the same project that must be done before this one can start. To say this ticket blocks another, use `mark_ticket` with `blocking`.",
  relatedTo: "Ids of related tickets in the same project."
} as const

export const CreateTicketInput = Schema.Struct({
  title: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(200))
  ).annotate({
    description: "The title, 1 to 200 characters."
  }),
  status: Schema.optional(TicketStatus).annotate({
    description: ticketFieldDocs.status
  }),
  type: Schema.optional(TicketType).annotate({
    description: ticketFieldDocs.type
  }),
  priority: Schema.optional(TicketPriority).annotate({
    description: ticketFieldDocs.priority
  }),
  estimate: Schema.optional(Schema.NullOr(Estimate)).annotate({
    description: ticketFieldDocs.estimate
  }),
  tags: Schema.optional(Schema.Array(TagName)).annotate({
    description: ticketFieldDocs.tags
  }),
  assignees: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: ticketFieldDocs.assignees
  }),
  body: Schema.optional(Schema.String).annotate({
    description: ticketFieldDocs.body
  }),
  parent: Schema.optional(TicketId).annotate({
    description: ticketFieldDocs.parent
  }),
  blockedBy: Schema.optional(Schema.Array(TicketId)).annotate({
    description: ticketFieldDocs.blockedBy
  }),
  relatedTo: Schema.optional(Schema.Array(TicketId)).annotate({
    description: ticketFieldDocs.relatedTo
  }),
  template: Schema.optional(Schema.NullOr(TypeKey)).annotate({
    description:
      "A template key from `list_templates` to expand into the body; omit or pass `null` for a blank ticket."
  })
})
export type CreateTicketInput = typeof CreateTicketInput.Type

export const DeleteTicketQuery = Schema.Struct({
  cascadeSubTickets: Schema.optional(Schema.Boolean)
})
export type DeleteTicketQuery = typeof DeleteTicketQuery.Type

export const ArchiveTicketInput = Schema.Struct({
  reason: Schema.optional(
    Schema.String.pipe(Schema.check(Schema.isMaxLength(20_000)))
  ),
  duplicateOf: Schema.optional(TicketId).annotate({
    description:
      "The id of the ticket this one duplicates. It must not itself be a duplicate, and no ticket may already be a duplicate of this one."
  })
})
export type ArchiveTicketInput = typeof ArchiveTicketInput.Type

export const UpdateTicketInput = Schema.Struct({
  title: Schema.optional(
    Schema.String.pipe(
      Schema.check(Schema.isMinLength(1)),
      Schema.check(Schema.isMaxLength(200))
    )
  ).annotate({ description: "A new title, 1 to 200 characters." }),
  status: Schema.optional(TicketStatus).annotate({
    description:
      "A status slug from `list_statuses`; don't set one that git automation sets (`setBy`)."
  }),
  type: Schema.optional(TicketType).annotate({
    description: ticketFieldDocs.type
  }),
  priority: Schema.optional(TicketPriority).annotate({
    description: ticketFieldDocs.priority
  }),
  estimate: Schema.optional(Schema.NullOr(Estimate)).annotate({
    description: ticketFieldDocs.estimate
  }),
  tags: Schema.optional(Schema.Array(TagName)).annotate({
    description: `${ticketFieldDocs.tags} Pass an empty list to clear.`
  }),
  assignees: Schema.optional(Schema.Array(Schema.String)).annotate({
    description: `${ticketFieldDocs.assignees} Pass an empty list to clear.`
  }),
  body: Schema.optional(Schema.String).annotate({
    description: `${ticketFieldDocs.body} Replaces the whole description.`
  }),
  parent: Schema.optional(Schema.NullOr(TicketId)).annotate({
    description: `${ticketFieldDocs.parent} \`null\` removes the parent.`
  }),
  blockedBy: Schema.optional(Schema.Array(TicketId)).annotate({
    description: `${ticketFieldDocs.blockedBy} Replaces the list; pass an empty list to clear.`
  }),
  relatedTo: Schema.optional(Schema.Array(TicketId)).annotate({
    description: `${ticketFieldDocs.relatedTo} Replaces the list stored on this ticket; pass an empty list to clear.`
  })
})
export type UpdateTicketInput = typeof UpdateTicketInput.Type

export const SplitTicketResultInput = Schema.Struct({
  title: Schema.String.pipe(
    Schema.check(Schema.isMinLength(1)),
    Schema.check(Schema.isMaxLength(200))
  ),
  type: TicketType,
  status: TicketStatus,
  priority: TicketPriority,
  sprintId: Schema.NullOr(GroupId),
  assignees: Schema.Array(Schema.String)
})
export type SplitTicketResultInput = typeof SplitTicketResultInput.Type

export const SPLIT_TICKET_MIN_RESULTS = 2
export const SPLIT_TICKET_MAX_RESULTS = 10

export const SplitTicketInput = Schema.Struct({
  results: Schema.Array(SplitTicketResultInput).pipe(
    Schema.check(Schema.isMinLength(SPLIT_TICKET_MIN_RESULTS)),
    Schema.check(Schema.isMaxLength(SPLIT_TICKET_MAX_RESULTS))
  )
})
export type SplitTicketInput = typeof SplitTicketInput.Type

export const SplitTicketResult = Schema.Struct({
  retained: TicketDetail,
  created: Schema.Array(TicketDetail)
})
export type SplitTicketResult = typeof SplitTicketResult.Type
