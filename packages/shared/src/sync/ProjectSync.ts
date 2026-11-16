import * as Effect from "effect/Effect"
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

export const NO_DESCRIPTION_REVISION: SyncCursor = "0.0"

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
  updatedAt: Schema.DateFromString,
  descriptionRevision: SyncCursor.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(NO_DESCRIPTION_REVISION))
  ).annotate({
    description:
      "The change-log position of the last change to the ticket's description."
  })
})
export type TicketFact = typeof TicketFact.Type

export const GroupHeader = Schema.Struct({
  id: Schema.String,
  kind: GroupKind,
  name: Schema.String,
  color: Schema.String,
  startsAt: Schema.NullOr(Schema.DateFromString),
  endsAt: Schema.NullOr(Schema.DateFromString),
  completedAt: Schema.NullOr(Schema.DateFromString),
  createdBy: Schema.String,
  createdAt: Schema.DateFromString,
  updatedAt: Schema.DateFromString
})
export type GroupHeader = typeof GroupHeader.Type

export const GroupFact = Schema.Struct({
  ...GroupHeader.fields,
  tickets: Schema.Array(Schema.String)
})
export type GroupFact = typeof GroupFact.Type

export const GroupMemberFact = Schema.Struct({
  group: Schema.String,
  ticket: Schema.String,
  position: Schema.Finite
})
export type GroupMemberFact = typeof GroupMemberFact.Type

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

export const SnapshotStart = Schema.Struct({
  project: ProjectFact,
  groups: Schema.Array(GroupHeader),
  statuses: Schema.Array(StatusFact),
  tags: Schema.Array(TagFact),
  members: Schema.Array(MemberFact),
  ticketCount: Schema.Finite
})
export type SnapshotStart = typeof SnapshotStart.Type

export const SnapshotPage = Schema.Struct({
  kind: Schema.Literal("snapshot"),
  base: SyncCursor,
  git: Schema.Boolean,
  start: Schema.NullOr(SnapshotStart),
  tickets: Schema.Array(TicketFact),
  groupMembers: Schema.Array(GroupMemberFact),
  next: Schema.NullOr(Schema.String)
}).annotate({
  description:
    "One page of a project's facts. A page with `start` begins a new snapshot at log position `base`; follow `next` to the end, then catch up with `after=base`."
})
export type SnapshotPage = typeof SnapshotPage.Type

export type ProjectSnapshot = Readonly<{
  kind: "snapshot"
  cursor: SyncCursor
  project: ProjectFact
  tickets: ReadonlyArray<TicketFact>
  groups: ReadonlyArray<GroupFact>
  statuses: ReadonlyArray<StatusFact>
  tags: ReadonlyArray<TagFact>
  members: ReadonlyArray<MemberFact>
}>

export const snapshotFromPages = (
  start: SnapshotStart,
  pages: ReadonlyArray<SnapshotPage>,
  base: SyncCursor
): ProjectSnapshot => {
  const members = new Map<string, Array<GroupMemberFact>>()
  for (const page of pages)
    for (const member of page.groupMembers) {
      const list = members.get(member.group)
      if (list === undefined) members.set(member.group, [member])
      else list.push(member)
    }
  return {
    kind: "snapshot",
    cursor: base,
    project: start.project,
    tickets: pages.flatMap((page) => page.tickets),
    groups: start.groups.map((group) => ({
      ...group,
      tickets: (members.get(group.id) ?? [])
        .toSorted((a, b) => a.position - b.position)
        .map((member) => member.ticket)
    })),
    statuses: start.statuses,
    tags: start.tags,
    members: start.members
  }
}

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
  comments: Schema.Array(Schema.String),
  git: Schema.Boolean,
  more: Schema.Boolean
}).annotate({
  description:
    "Facts named by log entries after the request's cursor, read as they are now. `cursor` covers every change up to it, possibly later ones; with `more`, ask again with `after=cursor`."
})
export type ProjectChanges = typeof ProjectChanges.Type

export const ProjectSync = Schema.Union([SnapshotPage, ProjectChanges])
export type ProjectSync = typeof ProjectSync.Type

export const ProjectSyncQuery = Schema.Struct({
  after: Schema.optional(SyncCursor),
  page: Schema.optional(Schema.String)
})
export type ProjectSyncQuery = typeof ProjectSyncQuery.Type
