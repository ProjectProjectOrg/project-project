import type {
  ActivityActor,
  AttachBranchInput,
  ClearStaleEstimatesResult,
  SprintCompletedImmutable,
  BranchExists,
  BranchNotFound,
  BranchProtected,
  Conflict,
  CreateBranchInput,
  CreateTicketInput,
  GitHubError,
  GroupDetail,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  GitStatesResponse,
  MentionInvalid,
  MyTicketsQuery,
  NotFound,
  OpenPrInput,
  OpenPrResult,
  OrgTicketPage,
  ProjectTicketsPreview,
  QuickCreateTicketInput,
  RecentTicketRow,
  RateLimited,
  SplitTicketInput,
  SplitTicketResult,
  RepoGone,
  Ticket,
  TicketCountQuery,
  TicketSearchQuery,
  TicketCounts,
  TicketDetail,
  TicketListPage,
  TicketListQuery,
  TicketSections,
  TicketSort,
  TicketSprintSections,
  TicketUpdateResult,
  UpdateTicketInput,
  UpdateTicketOrderInput,
  Validation,
  OrgScope,
  ProjectScope,
  Forbidden
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { InvalidCommentBody } from "../comments/Comments"
import type { MarkdownError } from "../markdown/Markdown"
import type { MalformedTicketDocument } from "./TicketDocs"

type TicketReadError = NotFound | MarkdownError | MalformedTicketDocument

type GitHubFailure =
  | GitHubTokenExpired
  | GitHubScopeInsufficient
  | RepoGone
  | RateLimited
  | GitHubError

export type TicketsShape = Readonly<{
  mine: (query: MyTicketsQuery) => Effect.Effect<OrgTicketPage, never, OrgScope>
  mineByProject: () => Effect.Effect<
    ReadonlyArray<ProjectTicketsPreview>,
    never,
    OrgScope
  >
  recent: () => Effect.Effect<ReadonlyArray<RecentTicketRow>, never, OrgScope>
  sections: (
    query: TicketListQuery
  ) => Effect.Effect<
    TicketSections,
    Forbidden | NotFound | MarkdownError,
    ProjectScope
  >
  sprintSections: (
    query: TicketListQuery
  ) => Effect.Effect<
    TicketSprintSections,
    Forbidden | NotFound | MarkdownError,
    ProjectScope
  >
  list: (
    query: TicketListQuery,
    limit?: number
  ) => Effect.Effect<
    TicketListPage,
    Forbidden | NotFound | MarkdownError,
    ProjectScope
  >
  count: (
    query: TicketCountQuery
  ) => Effect.Effect<
    TicketCounts,
    Forbidden | NotFound | MarkdownError,
    ProjectScope
  >
  search: (
    options: TicketSearchQuery
  ) => Effect.Effect<
    ReadonlyArray<Ticket>,
    NotFound | MarkdownError,
    ProjectScope
  >
  listInGroup: (
    groupId: string
  ) => Effect.Effect<
    ReadonlyArray<Ticket>,
    NotFound | MarkdownError,
    ProjectScope
  >
  tagUsageCounts: () => Effect.Effect<
    Readonly<Record<string, number>>,
    never,
    ProjectScope
  >
  get: (
    id: string
  ) => Effect.Effect<TicketDetail, TicketReadError, ProjectScope>
  quickCreate: (
    input: QuickCreateTicketInput
  ) => Effect.Effect<
    TicketDetail,
    Forbidden | NotFound | Validation | MentionInvalid | MarkdownError,
    ProjectScope
  >
  create: (
    input: CreateTicketInput
  ) => Effect.Effect<
    TicketDetail,
    Forbidden | NotFound | Validation | MentionInvalid | MarkdownError,
    ProjectScope
  >
  update: (
    id: string,
    input: UpdateTicketInput,
    sort?: TicketSort,
    expectedBody?: string
  ) => Effect.Effect<
    TicketUpdateResult,
    Forbidden | TicketReadError | Validation | MentionInvalid,
    ProjectScope | ActivityActor
  >
  clearStaleEstimates: () => Effect.Effect<
    ClearStaleEstimatesResult,
    Forbidden | TicketReadError,
    ProjectScope | ActivityActor
  >
  moveInGroup: (
    groupId: string,
    input: UpdateTicketOrderInput
  ) => Effect.Effect<
    GroupDetail,
    | NotFound
    | Forbidden
    | SprintCompletedImmutable
    | Validation
    | MarkdownError,
    ProjectScope | ActivityActor
  >
  split: (
    id: string,
    input: SplitTicketInput
  ) => Effect.Effect<
    SplitTicketResult,
    | Conflict
    | Forbidden
    | TicketReadError
    | Validation
    | MentionInvalid
    | SprintCompletedImmutable,
    ProjectScope | ActivityActor
  >
  remove: (
    id: string
  ) => Effect.Effect<
    void,
    NotFound | MarkdownError,
    ProjectScope | ActivityActor
  >
  archive: (
    id: string,
    reason?: string
  ) => Effect.Effect<
    TicketDetail,
    Forbidden | TicketReadError | MentionInvalid | InvalidCommentBody,
    ProjectScope | ActivityActor
  >
  unarchive: (
    id: string
  ) => Effect.Effect<
    TicketDetail,
    Forbidden | TicketReadError,
    ProjectScope | ActivityActor
  >
  replaceTag: (
    orgSlug: string,
    slug: string,
    id: string,
    oldName: string,
    newName: string | null
  ) => Effect.Effect<boolean, TicketReadError, ActivityActor>
  replaceStatus: (
    orgSlug: string,
    slug: string,
    id: string,
    newStatus: string,
    reason: "renamed" | "removed"
  ) => Effect.Effect<boolean, TicketReadError, ActivityActor>
  createBranch: (
    id: string,
    input: CreateBranchInput
  ) => Effect.Effect<
    TicketDetail,
    TicketReadError | Conflict | BranchExists | BranchProtected | GitHubFailure,
    ProjectScope | ActivityActor
  >
  attachBranch: (
    id: string,
    input: AttachBranchInput
  ) => Effect.Effect<
    TicketDetail,
    TicketReadError | Conflict | BranchNotFound | GitHubFailure,
    ProjectScope | ActivityActor
  >
  openPr: (
    id: string,
    input: OpenPrInput
  ) => Effect.Effect<
    OpenPrResult,
    TicketReadError | Conflict | BranchProtected | GitHubFailure,
    ProjectScope | ActivityActor
  >
  clearBranch: (
    id: string
  ) => Effect.Effect<
    TicketDetail,
    TicketReadError,
    ProjectScope | ActivityActor
  >
  getGitState: (
    ticketId: string | undefined
  ) => Effect.Effect<GitStatesResponse, NotFound | MarkdownError, ProjectScope>
  listGitStates: () => Effect.Effect<
    GitStatesResponse,
    NotFound | MarkdownError,
    ProjectScope
  >
}>

export class Tickets extends Context.Service<Tickets, TicketsShape>()(
  "@pp/server-core/tickets/Tickets"
) {}
