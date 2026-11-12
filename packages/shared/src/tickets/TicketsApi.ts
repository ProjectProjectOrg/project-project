import * as Effect from "effect/Effect"
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import * as Schema from "effect/Schema"

import { OrgAccess, RequiresOrg } from "../access/OrgAccess"
import { ProjectAccess, RequiresProject } from "../access/ProjectAccess"
import { Authentication } from "../auth/Authentication"
import {
  BranchExists,
  BranchNotFound,
  BranchProtected,
  Conflict,
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  MentionInvalid,
  NotFound,
  RateLimited,
  RepoGone,
  SprintCompletedImmutable,
  Unauthorized,
  Validation
} from "../errors"
import { ClearStaleEstimatesResult } from "../estimates/Estimate"
import {
  DEFAULT_TICKET_SORT,
  MyTicketsQuery,
  OrgTicketPage,
  ProjectTicketsPreview,
  RecentTicketRow,
  TicketCountQuery,
  TicketCounts,
  TicketEpicSections,
  TicketListPage,
  TicketListQuery,
  TicketNeighbors,
  TicketOrderKeyQuery,
  TicketSearchQuery,
  TicketSection,
  TicketSections,
  TicketSort,
  TicketSprintSections,
  TicketUpdateResult,
  TicketViewSource
} from "../filters/Ticket"
import {
  AttachBranchInput,
  CreateBranchInput,
  OpenPrInput,
  OpenPrResult
} from "../github/GitState"
import { OrgPath, ProjectPath, TicketPath } from "../http/paths"
import {
  BulkArchiveTicketsInput,
  BulkDeleteTicketsInput,
  BulkTicketsResult,
  BulkUpdateTicketsInput,
  BulkUpdateTicketsResult
} from "./BulkTickets"
import { MovedTicketLocation, MoveTicketInput, MoveTicketResult } from "./move"
import {
  ArchiveTicketInput,
  CreateTicketInput,
  DeleteTicketQuery,
  MarkTicketInput,
  QuickCreateTicketInput,
  SplitTicketInput,
  SplitTicketResult,
  Ticket,
  TicketDetail,
  UpdateTicketInput
} from "./Ticket"
import { TicketActivityPage } from "./TicketActivity"
import {
  TicketTextHit,
  TicketTextSearchQuery,
  TicketTitle
} from "./TicketTextSearch"

const TicketListHttpQuery = TicketListQuery.pipe(
  Schema.fieldsAssign({
    sort: Schema.fromJsonString(TicketSort).pipe(
      Schema.withDecodingDefaultType(Effect.succeed(DEFAULT_TICKET_SORT))
    )
  })
)

const TicketPageHttpQuery = TicketListHttpQuery.pipe(
  Schema.fieldsAssign({
    section: Schema.optional(Schema.fromJsonString(TicketSection))
  })
)

const TicketOrderKeyHttpQuery = TicketOrderKeyQuery.pipe(
  Schema.fieldsAssign({
    sort: Schema.optional(Schema.fromJsonString(TicketSort))
  })
)

export const TicketsGroup = HttpApiGroup.make("tickets")
  .add(
    HttpApiEndpoint.get("mine", "/orgs/:orgSlug/tickets/mine", {
      params: OrgPath,
      query: MyTicketsQuery,
      success: OrgTicketPage,
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "mineByProject",
      "/orgs/:orgSlug/tickets/mine/by-project",
      {
        params: OrgPath,
        success: Schema.Array(ProjectTicketsPreview),
        error: [Unauthorized, NotFound]
      }
    )
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get("recent", "/orgs/:orgSlug/tickets/recent", {
      params: OrgPath,
      success: Schema.Array(RecentTicketRow),
      error: [Unauthorized, NotFound]
    })
      .annotate(RequiresOrg, "membership")
      .middleware(OrgAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "sections",
      "/orgs/:orgSlug/projects/:slug/tickets/sections",
      {
        params: ProjectPath,
        query: TicketListHttpQuery,
        success: TicketSections,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "sprintSections",
      "/orgs/:orgSlug/projects/:slug/tickets/sprint-sections",
      {
        params: ProjectPath,
        query: TicketListHttpQuery,
        success: TicketSprintSections,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "bulkUpdate",
      "/orgs/:orgSlug/projects/:slug/tickets/bulk",
      {
        params: ProjectPath,
        payload: BulkUpdateTicketsInput,
        success: BulkUpdateTicketsResult,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          Validation,
          SprintCompletedImmutable
        ]
      }
    )
      .annotate(RequiresProject, "membership")
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "bulkArchive",
      "/orgs/:orgSlug/projects/:slug/tickets/bulk/archive",
      {
        params: ProjectPath,
        payload: BulkArchiveTicketsInput,
        success: BulkTicketsResult,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          Conflict,
          Validation,
          MentionInvalid
        ]
      }
    )
      .annotate(RequiresProject, { ticket: ["update"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "bulkDelete",
      "/orgs/:orgSlug/projects/:slug/tickets/bulk/delete",
      {
        params: ProjectPath,
        payload: BulkDeleteTicketsInput,
        success: BulkTicketsResult,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["delete"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "epicSections",
      "/orgs/:orgSlug/projects/:slug/tickets/epic-sections",
      {
        params: ProjectPath,
        query: TicketListHttpQuery,
        success: TicketEpicSections,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "parentSections",
      "/orgs/:orgSlug/projects/:slug/tickets/parent-sections",
      {
        params: ProjectPath,
        query: TicketListHttpQuery,
        success: TicketEpicSections,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get("list", "/orgs/:orgSlug/projects/:slug/tickets", {
      params: ProjectPath,
      query: TicketPageHttpQuery,
      success: TicketListPage,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "search",
      "/orgs/:orgSlug/projects/:slug/tickets/search",
      {
        params: ProjectPath,
        query: TicketSearchQuery,
        success: Schema.Array(Ticket),
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "titles",
      "/orgs/:orgSlug/projects/:slug/tickets/titles",
      {
        params: ProjectPath,
        success: Schema.Array(TicketTitle),
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "textSearch",
      "/orgs/:orgSlug/projects/:slug/tickets/text-search",
      {
        params: ProjectPath,
        query: TicketTextSearchQuery,
        success: Schema.Array(TicketTextHit),
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "count",
      "/orgs/:orgSlug/projects/:slug/tickets/count",
      {
        params: ProjectPath,
        query: TicketCountQuery,
        success: TicketCounts,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "quickCreate",
      "/orgs/:orgSlug/projects/:slug/tickets/quick",
      {
        params: ProjectPath,
        payload: QuickCreateTicketInput,
        success: TicketDetail,
        error: [Unauthorized, NotFound, Forbidden, Validation, MentionInvalid]
      }
    )
      .annotate(RequiresProject, { ticket: ["create"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post("create", "/orgs/:orgSlug/projects/:slug/tickets", {
      params: ProjectPath,
      payload: CreateTicketInput,
      success: TicketDetail,
      error: [Unauthorized, NotFound, Forbidden, Validation, MentionInvalid]
    })
      .annotate(RequiresProject, { ticket: ["create"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "clearStaleEstimates",
      "/orgs/:orgSlug/projects/:slug/estimates/clear-stale",
      {
        params: ProjectPath,
        success: ClearStaleEstimatesResult,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { settings: ["manage"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get("get", "/orgs/:orgSlug/projects/:slug/tickets/:id", {
      params: TicketPath,
      success: TicketDetail,
      error: [Unauthorized, NotFound, Forbidden]
    })
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "neighbors",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/neighbors",
      {
        params: TicketPath,
        query: Schema.Struct({ from: Schema.fromJsonString(TicketViewSource) }),
        success: Schema.NullOr(TicketNeighbors),
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.patch(
      "update",
      "/orgs/:orgSlug/projects/:slug/tickets/:id",
      {
        params: TicketPath,
        query: TicketOrderKeyHttpQuery,
        payload: UpdateTicketInput,
        success: TicketUpdateResult,
        error: [Unauthorized, NotFound, Forbidden, Validation, MentionInvalid]
      }
    )
      .annotate(RequiresProject, "membership")
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "delete",
      "/orgs/:orgSlug/projects/:slug/tickets/:id",
      {
        params: TicketPath,
        query: DeleteTicketQuery,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["delete"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "archive",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/archive",
      {
        params: TicketPath,
        payload: ArchiveTicketInput,
        success: TicketDetail,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          Conflict,
          Validation,
          MentionInvalid
        ]
      }
    )
      .annotate(RequiresProject, { ticket: ["update"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "unarchive",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/unarchive",
      {
        params: TicketPath,
        success: TicketDetail,
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    )
      .annotate(RequiresProject, { ticket: ["update"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "mark",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/mark",
      {
        params: TicketPath,
        payload: MarkTicketInput,
        success: TicketDetail,
        error: [Unauthorized, NotFound, Forbidden, Validation]
      }
    )
      .annotate(RequiresProject, { ticket: ["update"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "unmark",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/unmark",
      {
        params: TicketPath,
        payload: MarkTicketInput,
        success: TicketDetail,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["update"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "createBranch",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/branch",
      {
        params: TicketPath,
        payload: CreateBranchInput,
        success: TicketDetail,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          Conflict,
          BranchExists,
          BranchProtected,
          GitHubTokenExpired,
          GitHubScopeInsufficient,
          RepoGone,
          RateLimited,
          GitHubError
        ]
      }
    )
      .annotate(RequiresProject, { github: ["write"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "openPr",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/pr",
      {
        params: TicketPath,
        payload: OpenPrInput,
        success: OpenPrResult,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          Conflict,
          BranchProtected,
          GitHubTokenExpired,
          GitHubScopeInsufficient,
          RepoGone,
          RateLimited,
          GitHubError
        ]
      }
    )
      .annotate(RequiresProject, { github: ["write"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.delete(
      "clearBranch",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/branch",
      {
        params: TicketPath,
        success: TicketDetail,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { github: ["write"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "split",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/split",
      {
        params: TicketPath,
        payload: SplitTicketInput,
        success: SplitTicketResult,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          Conflict,
          Validation,
          MentionInvalid,
          SprintCompletedImmutable
        ]
      }
    )
      .annotate(RequiresProject, { ticket: ["create"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "move",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/move",
      {
        params: TicketPath,
        payload: MoveTicketInput,
        success: MoveTicketResult,
        error: [Unauthorized, NotFound, Forbidden, Conflict, Validation]
      }
    )
      .annotate(RequiresProject, { ticket: ["delete"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.get(
      "movedTo",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/moved-to",
      {
        params: TicketPath,
        success: MovedTicketLocation,
        error: [Unauthorized, NotFound, Forbidden]
      }
    )
      .annotate(RequiresProject, { ticket: ["read"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "stackBranch",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/stacked-branches",
      {
        params: TicketPath,
        payload: AttachBranchInput,
        success: TicketDetail,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          Conflict,
          BranchNotFound,
          GitHubTokenExpired,
          GitHubScopeInsufficient,
          RepoGone,
          RateLimited,
          GitHubError
        ]
      }
    )
      .annotate(RequiresProject, { github: ["write"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "unstackBranch",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/stacked-branches/remove",
      {
        params: TicketPath,
        payload: AttachBranchInput,
        success: TicketDetail,
        error: [Unauthorized, NotFound, Forbidden, Conflict]
      }
    )
      .annotate(RequiresProject, { github: ["write"] })
      .middleware(ProjectAccess)
  )
  .add(
    HttpApiEndpoint.post(
      "attachBranch",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/attach-branch",
      {
        params: TicketPath,
        payload: AttachBranchInput,
        success: TicketDetail,
        error: [
          Unauthorized,
          NotFound,
          Forbidden,
          Conflict,
          BranchNotFound,
          GitHubTokenExpired,
          GitHubScopeInsufficient,
          RepoGone,
          RateLimited,
          GitHubError
        ]
      }
    )
      .annotate(RequiresProject, { github: ["write"] })
      .middleware(ProjectAccess)
  )
  .middleware(Authentication)

export const TicketActivityGroup = HttpApiGroup.make("ticketActivity")
  .add(
    HttpApiEndpoint.get(
      "list",
      "/orgs/:orgSlug/projects/:slug/tickets/:id/activity",
      {
        params: TicketPath,
        query: Schema.Struct({ cursor: Schema.optional(Schema.String) }),
        success: TicketActivityPage,
        error: [Unauthorized, NotFound, Forbidden, Validation]
      }
    ).annotate(RequiresProject, { ticket: ["read"] })
  )
  .middleware(ProjectAccess)
  .middleware(Authentication)
