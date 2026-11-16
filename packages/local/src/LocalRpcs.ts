import {
  EstimationMode,
  TicketCountQuery,
  TicketCounts,
  TicketListPage,
  TicketEpicSections,
  TicketListQuery,
  TicketSprintSections,
  TicketStatus
} from "@pp/shared"
import { Rpc, RpcGroup } from "effect/rpc"
import * as Schema from "effect/Schema"

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
  })
) {}

export const LocalWorkerInit = Schema.Struct({ userId: Schema.String })
