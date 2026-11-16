import {
  EstimationMode,
  Group,
  GroupId,
  Ticket,
  TicketCountQuery,
  TicketId,
  TicketListRow,
  TicketListSource,
  TicketSequence,
  TicketTitle,
  TicketCounts,
  TicketListPage,
  TicketEpicSections,
  TicketListQuery,
  TicketSprintSections,
  TicketStatus
} from "@pp/shared"
import { SyncCursor, TicketParentState, TicketRelations } from "@pp/shared"
import { Rpc, RpcGroup } from "effect/rpc"
import * as Schema from "effect/Schema"

import { EditRejected, PendingEdit, PendingWrite } from "./pending"

export const LocalSyncState = Schema.Literals([
  "live",
  "behind",
  "offline",
  "erroring"
])
export type LocalSyncState = typeof LocalSyncState.Type

export const LocalStatus = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("initializing") }),
  Schema.Struct({ kind: Schema.Literal("ready"), sync: LocalSyncState }),
  Schema.Struct({ kind: Schema.Literal("denied") }),
  Schema.Struct({ kind: Schema.Literal("failed") })
])
export type LocalStatus = typeof LocalStatus.Type

export const LocalProject = Schema.Struct({
  orgSlug: Schema.String,
  slug: Schema.String
})
export type LocalProject = typeof LocalProject.Type

export const scopeOf = (project: LocalProject): string =>
  `${project.orgSlug}/${project.slug}`

const GitRepository = Schema.Struct({
  repoOwner: Schema.String,
  repoName: Schema.String,
  defaultBaseBranch: Schema.NullOr(Schema.String)
})

export const LocalRepositories = Schema.Struct({
  fallback: Schema.NullOr(GitRepository),
  byId: Schema.Record(Schema.String, GitRepository)
})
export type LocalRepositories = typeof LocalRepositories.Type

const viewer = {
  viewerId: Schema.UndefinedOr(Schema.String),
  estimation: EstimationMode
}

export const CountsRequest = Schema.Struct({
  project: LocalProject,
  query: TicketCountQuery,
  ...viewer
})
export type CountsRequest = typeof CountsRequest.Type

export const SectionsRequest = Schema.Struct({
  project: LocalProject,
  query: TicketListQuery,
  ...viewer,
  repositories: LocalRepositories,
  pages: Schema.Record(Schema.String, Schema.Finite),
  pageSize: Schema.Finite
})
export type SectionsRequest = typeof SectionsRequest.Type

export const ParentSectionsRequest = Schema.Struct({
  ...SectionsRequest.fields,
  by: Schema.Literals(["epic", "parent"])
})

export const LocalSectionsResult = Schema.Struct({
  counts: TicketCounts,
  sections: Schema.Record(TicketStatus, TicketListPage)
})
export type LocalSectionsResult = typeof LocalSectionsResult.Type

export const TicketListRequest = Schema.Struct({
  project: LocalProject,
  query: TicketListQuery,
  ...viewer,
  repositories: LocalRepositories
})

export const SprintBoardRequest = Schema.Struct({
  project: LocalProject,
  groupId: GroupId,
  repositories: LocalRepositories
})

export const LocalSprintBoard = Schema.Struct({
  tickets: Schema.Array(Ticket),
  completedAt: Schema.NullOr(Schema.DateFromString)
})

export const SequenceRequest = Schema.Struct({
  project: LocalProject,
  id: TicketId,
  from: Schema.UndefinedOr(TicketListSource),
  ...viewer
})

export const LocalSequence = Schema.Struct({
  sequence: Schema.NullOr(TicketSequence)
})
export const LocalTicketRequest = Schema.Struct({
  project: LocalProject,
  id: Schema.String,
  repositories: LocalRepositories
})
export type LocalTicketRequest = typeof LocalTicketRequest.Type

export const LocalTicket = Schema.Struct({
  ticket: Ticket,
  relations: TicketRelations,
  parentState: Schema.NullOr(TicketParentState)
})
export type LocalTicket = typeof LocalTicket.Type

export const DescriptionVersion = Schema.Struct({
  body: Schema.String,
  revision: SyncCursor
})
export type DescriptionVersion = typeof DescriptionVersion.Type

export const LocalDescription = Schema.Struct({
  server: DescriptionVersion,
  missingAttachments: Schema.Array(Schema.String),
  edit: Schema.NullOr(
    Schema.Struct({
      body: Schema.String,
      base: DescriptionVersion,
      conflict: Schema.NullOr(DescriptionVersion),
      failed: Schema.NullOr(Schema.String)
    })
  )
})
export type LocalDescription = typeof LocalDescription.Type

export const DescriptionRequest = Schema.Struct({
  project: LocalProject,
  id: Schema.String
})
export type DescriptionRequest = typeof DescriptionRequest.Type

export const PrefetchDescriptionsRequest = Schema.Struct({
  project: LocalProject,
  ids: Schema.Array(Schema.String),
  sprint: Schema.Boolean
})
export type PrefetchDescriptionsRequest =
  typeof PrefetchDescriptionsRequest.Type

export const SaveDescriptionRequest = Schema.Struct({
  project: LocalProject,
  id: Schema.String,
  body: Schema.String,
  base: DescriptionVersion
})
export type SaveDescriptionRequest = typeof SaveDescriptionRequest.Type

export const ResolveDescriptionRequest = Schema.Struct({
  project: LocalProject,
  id: Schema.String,
  keep: Schema.Literals(["mine", "theirs"])
})
export type ResolveDescriptionRequest = typeof ResolveDescriptionRequest.Type

export const TicketDataKind = Schema.Literals([
  "comments",
  "activity",
  "subscribers"
])
export type TicketDataKind = typeof TicketDataKind.Type

export const TicketDataRequest = Schema.Struct({
  project: LocalProject,
  ticket: Schema.String,
  kind: TicketDataKind
})
export type TicketDataRequest = typeof TicketDataRequest.Type

export class LocalRpcs extends RpcGroup.make(
  Rpc.make("Hydrated", { payload: LocalProject, success: Schema.Boolean }),
  Rpc.make("Pull", { payload: LocalProject, success: LocalStatus }),
  Rpc.make("CheckFacts", { payload: LocalProject }),
  Rpc.make("Sections", {
    payload: SectionsRequest,
    success: Schema.NullOr(LocalSectionsResult),
    stream: true
  }),
  Rpc.make("SprintSections", {
    payload: SectionsRequest,
    success: Schema.NullOr(TicketSprintSections),
    stream: true
  }),
  Rpc.make("ParentSections", {
    payload: ParentSectionsRequest,
    success: Schema.NullOr(TicketEpicSections),
    stream: true
  }),
  Rpc.make("Counts", {
    payload: CountsRequest,
    success: Schema.NullOr(TicketCounts),
    stream: true
  }),
  Rpc.make("TicketList", {
    payload: TicketListRequest,
    success: Schema.NullOr(Schema.Array(TicketListRow)),
    stream: true
  }),
  Rpc.make("SprintBoard", {
    payload: SprintBoardRequest,
    success: Schema.NullOr(LocalSprintBoard),
    stream: true
  }),
  Rpc.make("Groups", {
    payload: LocalProject,
    success: Schema.NullOr(Schema.Array(Group)),
    stream: true
  }),
  Rpc.make("Titles", {
    payload: LocalProject,
    success: Schema.NullOr(Schema.Array(TicketTitle)),
    stream: true
  }),
  Rpc.make("Sequence", {
    payload: SequenceRequest,
    success: Schema.NullOr(LocalSequence)
  }),
  Rpc.make("Edit", {
    payload: Schema.Struct({
      project: LocalProject,
      write: PendingWrite,
      edits: Schema.Array(PendingEdit)
    }),
    error: EditRejected
  }),
  Rpc.make("Ticket", {
    payload: LocalTicketRequest,
    success: Schema.NullOr(LocalTicket),
    stream: true
  }),
  Rpc.make("Description", {
    payload: DescriptionRequest,
    success: Schema.NullOr(LocalDescription),
    stream: true
  }),
  Rpc.make("PrefetchDescriptions", { payload: PrefetchDescriptionsRequest }),
  Rpc.make("SaveDescription", { payload: SaveDescriptionRequest }),
  Rpc.make("ResolveDescription", { payload: ResolveDescriptionRequest }),
  Rpc.make("CachedTicketData", {
    payload: TicketDataRequest,
    success: Schema.NullOr(Schema.String)
  }),
  Rpc.make("CacheTicketData", {
    payload: Schema.Struct({ ...TicketDataRequest.fields, data: Schema.String })
  })
) {}

export const LocalWorkerInit = Schema.Struct({ userId: Schema.String })
