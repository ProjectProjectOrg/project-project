import type {
  DeleteTicketQuery,
  ActivityActor,
  AttachBranchInput,
  BulkUpdateTicketsInput,
  BulkUpdateTicketsResult,
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
  NotFound,
  OpenPrInput,
  OpenPrResult,
  QuickCreateTicketInput,
  RateLimited,
  SplitTicketInput,
  SplitTicketResult,
  RepoGone,
  TicketDetail,
  TicketSort,
  TicketUpdateResult,
  UpdateTicketInput,
  UpdateTicketOrderInput,
  Validation,
  ProjectScope,
  Forbidden
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { InvalidCommentBody } from "../comments/Comments"
import type { MarkdownError } from "../markdown/Markdown"
import type { MalformedTicketDocument } from "./TicketDocs"

type TicketReadError = NotFound | MarkdownError | MalformedTicketDocument

export type TicketUpdateExpectation = Readonly<{
  body?: string
  updatedAt?: Date
}>

type GitHubFailure =
  | GitHubTokenExpired
  | GitHubScopeInsufficient
  | RepoGone
  | RateLimited
  | GitHubError

export type GitStateOptions = Readonly<{ reconcile: boolean }>

export type TicketsShape = Readonly<{
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
    expected?: TicketUpdateExpectation
  ) => Effect.Effect<
    TicketUpdateResult,
    Forbidden | TicketReadError | Validation | MentionInvalid | Conflict,
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
  bulkUpdate: (
    input: BulkUpdateTicketsInput
  ) => Effect.Effect<
    BulkUpdateTicketsResult,
    TicketReadError | Validation | Forbidden | SprintCompletedImmutable,
    ProjectScope | ActivityActor
  >
  remove: (
    id: string,
    options?: DeleteTicketQuery
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
    | Forbidden
    | Conflict
    | TicketReadError
    | MentionInvalid
    | InvalidCommentBody,
    ProjectScope | ActivityActor
  >
  unarchive: (
    id: string
  ) => Effect.Effect<
    TicketDetail,
    Forbidden | Conflict | TicketReadError,
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
  stackBranch: (
    id: string,
    input: AttachBranchInput
  ) => Effect.Effect<
    TicketDetail,
    TicketReadError | Conflict | BranchNotFound | GitHubFailure,
    ProjectScope | ActivityActor
  >
  unstackBranch: (
    id: string,
    input: AttachBranchInput
  ) => Effect.Effect<
    TicketDetail,
    TicketReadError | Conflict,
    ProjectScope | ActivityActor
  >
  getGitState: (
    ticketId: string | undefined,
    options?: GitStateOptions
  ) => Effect.Effect<GitStatesResponse, NotFound | MarkdownError, ProjectScope>
  listGitStates: (
    options?: GitStateOptions
  ) => Effect.Effect<GitStatesResponse, NotFound | MarkdownError, ProjectScope>
}>

export class Tickets extends Context.Service<Tickets, TicketsShape>()(
  "@pp/server-core/tickets/Tickets"
) {}
