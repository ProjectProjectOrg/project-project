import * as Schema from "effect/Schema"

import { Estimate, EstimationMode } from "../estimates/Estimate"
import { ChecksStatus } from "../github/GitState"
import { GroupKind } from "../groups/Group"
import { PullRequestState, TicketFlag, TicketPriority } from "../tickets/Ticket"

export const SyncCursor = Schema.String.annotate({
  description:
    "Where a local copy stands in a project's change log: `<generation>.<sequence>`."
})
export type SyncCursor = typeof SyncCursor.Type

export const TicketRelationKind = Schema.Literals([
  "blocked_by",
  "related",
  "duplicate_of"
])

export const TicketGitFact = Schema.Struct({
  repoId: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  pr: Schema.NullOr(Schema.Finite),
  prState: Schema.NullOr(PullRequestState),
  prDraft: Schema.Boolean,
  prBase: Schema.NullOr(Schema.String),
  lastTransitionedPr: Schema.NullOr(Schema.Finite),
  branchDeletedAt: Schema.NullOr(Schema.DateFromString),
  checks: Schema.NullOr(ChecksStatus)
})

export const TicketFact = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  status: Schema.String,
  type: Schema.NullOr(Schema.String),
  priority: TicketPriority,
  rank: Schema.String,
  estimate: Schema.NullOr(Estimate),
  tags: Schema.Array(Schema.String),
  assignees: Schema.Array(Schema.String),
  parent: Schema.NullOr(Schema.String),
  relations: Schema.Array(
    Schema.Struct({ to: Schema.String, kind: TicketRelationKind })
  ),
  flag: Schema.NullOr(TicketFlag),
  git: Schema.NullOr(TicketGitFact),
  archivedAt: Schema.NullOr(Schema.DateFromString),
  createdBy: Schema.String,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString
})
export type TicketFact = typeof TicketFact.Type

export const GroupFact = Schema.Struct({
  id: Schema.String,
  kind: GroupKind,
  name: Schema.String,
  color: Schema.String,
  startsAt: Schema.NullOr(Schema.DateFromString),
  endsAt: Schema.NullOr(Schema.DateFromString),
  completedAt: Schema.NullOr(Schema.DateFromString),
  tickets: Schema.Array(Schema.String),
  createdBy: Schema.String,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString
})
export type GroupFact = typeof GroupFact.Type

export const StatusFact = Schema.Struct({
  slug: Schema.String,
  label: Schema.String,
  icon: Schema.String,
  color: Schema.String,
  orderKey: Schema.String,
  description: Schema.NullOr(Schema.String)
})
export type StatusFact = typeof StatusFact.Type

export const TagFact = Schema.Struct({
  name: Schema.String,
  color: Schema.String
})
export type TagFact = typeof TagFact.Type

export const MemberFact = Schema.Struct({
  userId: Schema.String,
  role: Schema.String,
  name: Schema.String,
  username: Schema.NullOr(Schema.String),
  image: Schema.NullOr(Schema.String)
})
export type MemberFact = typeof MemberFact.Type

export const ProjectFact = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  name: Schema.String,
  icon: Schema.String,
  color: Schema.String,
  estimation: EstimationMode
})
export type ProjectFact = typeof ProjectFact.Type

const Facts = {
  tickets: Schema.Array(TicketFact),
  groups: Schema.Array(GroupFact),
  statuses: Schema.Array(StatusFact),
  tags: Schema.Array(TagFact),
  members: Schema.Array(MemberFact)
}

export const ProjectSnapshot = Schema.Struct({
  kind: Schema.Literal("snapshot"),
  cursor: SyncCursor,
  project: ProjectFact,
  ...Facts
})
export type ProjectSnapshot = typeof ProjectSnapshot.Type

export const ProjectChanges = Schema.Struct({
  kind: Schema.Literal("changes"),
  cursor: SyncCursor,
  project: Schema.NullOr(ProjectFact),
  upserts: Schema.Struct(Facts),
  deletes: Schema.Struct({
    tickets: Schema.Array(Schema.String),
    groups: Schema.Array(Schema.String),
    statuses: Schema.Array(Schema.String),
    tags: Schema.Array(Schema.String),
    members: Schema.Array(Schema.String)
  }),
  comments: Schema.Array(Schema.String)
})
export type ProjectChanges = typeof ProjectChanges.Type

export const ProjectSync = Schema.Union([ProjectSnapshot, ProjectChanges])
export type ProjectSync = typeof ProjectSync.Type

export const ProjectSyncQuery = Schema.Struct({
  after: Schema.optional(SyncCursor)
})
