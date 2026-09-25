import type {
  AttachBranchInput,
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

export interface TicketsShape {
  readonly mine: (
    query: MyTicketsQuery
  ) => Effect.Effect<OrgTicketPage, never, OrgScope>
  readonly mineByProject: () => Effect.Effect<
    ReadonlyArray<ProjectTicketsPreview>,
    never,
    OrgScope
  >
  readonly recent: () => Effect.Effect<
    ReadonlyArray<RecentTicketRow>,
    never,
    OrgScope
  >
  readonly sections: (
    query: TicketListQuery
  ) => Effect.Effect<
    TicketSections,
    Forbidden | NotFound | MarkdownError,
    ProjectScope
  >
  readonly sprintSections: (
    query: TicketListQuery
  ) => Effect.Effect<
    TicketSprintSections,
    Forbidden | NotFound | MarkdownError,
    ProjectScope
  >
  readonly list: (
    query: TicketListQuery,
    limit?: number
  ) => Effect.Effect<
    TicketListPage,
    Forbidden | NotFound | MarkdownError,
    ProjectScope
  >
  readonly count: (
    query: TicketCountQuery
  ) => Effect.Effect<
    TicketCounts,
    Forbidden | NotFound | MarkdownError,
    ProjectScope
  >
  readonly search: (
    options: TicketSearchQuery
  ) => Effect.Effect<
    ReadonlyArray<Ticket>,
    NotFound | MarkdownError,
    ProjectScope
  >
  readonly listInGroup: (
    groupId: string
  ) => Effect.Effect<
    ReadonlyArray<Ticket>,
    NotFound | MarkdownError,
    ProjectScope
  >
  readonly tagUsageCounts: () => Effect.Effect<
    Readonly<Record<string, number>>,
    never,
    ProjectScope
  >
  readonly get: (
    id: string
  ) => Effect.Effect<TicketDetail, TicketReadError, ProjectScope>
  readonly quickCreate: (
    input: QuickCreateTicketInput
  ) => Effect.Effect<
    TicketDetail,
    Forbidden | NotFound | Validation | MentionInvalid | MarkdownError,
    ProjectScope
  >
  readonly create: (
    input: CreateTicketInput
  ) => Effect.Effect<
    TicketDetail,
    Forbidden | NotFound | Validation | MentionInvalid | MarkdownError,
    ProjectScope
  >
  readonly update: (
    id: string,
    input: UpdateTicketInput,
    sort?: TicketSort,
    expectedBody?: string
  ) => Effect.Effect<
    TicketUpdateResult,
    Forbidden | TicketReadError | Validation | MentionInvalid,
    ProjectScope
  >
  readonly moveInGroup: (
    groupId: string,
    input: UpdateTicketOrderInput
  ) => Effect.Effect<
    GroupDetail,
    | NotFound
    | Forbidden
    | SprintCompletedImmutable
    | Validation
    | MarkdownError,
    ProjectScope
  >
  readonly split: (
    id: string,
    input: SplitTicketInput
  ) => Effect.Effect<
    SplitTicketResult,
    | Forbidden
    | TicketReadError
    | Validation
    | MentionInvalid
    | SprintCompletedImmutable,
    ProjectScope
  >
  readonly remove: (
    id: string
  ) => Effect.Effect<void, NotFound | MarkdownError, ProjectScope>
  readonly archive: (
    id: string,
    reason?: string
  ) => Effect.Effect<
    TicketDetail,
    Forbidden | TicketReadError | MentionInvalid | InvalidCommentBody,
    ProjectScope
  >
  readonly unarchive: (
    id: string
  ) => Effect.Effect<TicketDetail, Forbidden | TicketReadError, ProjectScope>
  readonly replaceTag: (
    orgSlug: string,
    slug: string,
    id: string,
    oldName: string,
    newName: string | null
  ) => Effect.Effect<boolean, TicketReadError>
  readonly replaceStatus: (
    orgSlug: string,
    slug: string,
    id: string,
    newStatus: string
  ) => Effect.Effect<boolean, TicketReadError>
  readonly createBranch: (
    id: string,
    input: CreateBranchInput
  ) => Effect.Effect<
    TicketDetail,
    TicketReadError | Conflict | BranchExists | BranchProtected | GitHubFailure,
    ProjectScope
  >
  readonly attachBranch: (
    id: string,
    input: AttachBranchInput
  ) => Effect.Effect<
    TicketDetail,
    TicketReadError | Conflict | BranchNotFound | GitHubFailure,
    ProjectScope
  >
  readonly openPr: (
    id: string,
    input: OpenPrInput
  ) => Effect.Effect<
    OpenPrResult,
    TicketReadError | Conflict | BranchProtected | GitHubFailure,
    ProjectScope
  >
  readonly clearBranch: (
    id: string
  ) => Effect.Effect<TicketDetail, TicketReadError, ProjectScope>
  readonly getGitState: (
    ticketId: string | undefined
  ) => Effect.Effect<GitStatesResponse, NotFound | MarkdownError, ProjectScope>
  readonly listGitStates: () => Effect.Effect<
    GitStatesResponse,
    NotFound | MarkdownError,
    ProjectScope
  >
}

export class Tickets extends Context.Service<Tickets, TicketsShape>()(
  "@pp/server-core/tickets/Tickets"
) {}
