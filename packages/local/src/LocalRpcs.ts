import {
  EstimationMode,
  SyncCursor,
  TicketCountQuery,
  TicketCounts,
  TicketListPage,
  TicketListQuery,
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
  limits: Schema.Record(Schema.String, Schema.Finite),
  defaultLimit: Schema.Finite
})
export type SectionsRequest = typeof SectionsRequest.Type

export const LocalSectionsResult = Schema.Struct({
  counts: TicketCounts,
  sections: Schema.Record(TicketStatus, TicketListPage)
})
export type LocalSectionsResult = typeof LocalSectionsResult.Type

export const LocalPull = Schema.Struct({
  at: Schema.Finite,
  millis: Schema.Finite,
  kind: Schema.Literals(["snapshot", "changes"]),
  facts: Schema.Finite
})
export type LocalPull = typeof LocalPull.Type

export const LocalDiagnostics = Schema.Struct({
  cursor: Schema.NullOr(SyncCursor),
  lastPull: Schema.NullOr(LocalPull),
  offline: Schema.Boolean
})
export type LocalDiagnostics = typeof LocalDiagnostics.Type

export class LocalRpcs extends RpcGroup.make(
  Rpc.make("Hydrated", { payload: LocalProject, success: Schema.Boolean }),
  Rpc.make("Pull", { payload: LocalProject, success: LocalStatus }),
  Rpc.make("CheckFacts", { payload: LocalProject }),
  Rpc.make("Diagnostics", {
    payload: LocalProject,
    success: LocalDiagnostics,
    stream: true
  }),
  Rpc.make("SimulateOffline", {
    payload: Schema.Struct({ offline: Schema.Boolean })
  }),
  Rpc.make("Sections", {
    payload: SectionsRequest,
    success: Schema.NullOr(LocalSectionsResult),
    stream: true
  }),
  Rpc.make("Counts", {
    payload: CountsRequest,
    success: Schema.NullOr(TicketCounts),
    stream: true
  })
) {}

export const LocalWorkerInit = Schema.Struct({ userId: Schema.String })
