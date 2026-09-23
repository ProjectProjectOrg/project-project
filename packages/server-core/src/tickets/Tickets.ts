import type {
  AttachBranchInput,
  Forbidden,
  SprintCompletedImmutable,
  BranchExists,
  BranchNotFound,
  BranchProtected,
  Conflict,
  CreateBranchInput,
  CreateTicketInput,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  GitStatesResponse,
  MentionInvalid,
  MyTicketsQuery,
  NotFound,
  OpenPrInput,
  OpenPrResult,
  OrgTicketPage,
  OrgTicketRow,
  QuickCreateTicketInput,
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
  Validation
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { InvalidCommentBody } from "../comments/Comments"
import type { MarkdownError } from "../markdown/Markdown"
import type { MalformedTicketDocument } from "./TicketDocs"

type TicketReadError = NotFound | MarkdownError | MalformedTicketDocument

export interface TicketsShape {
  readonly mine: (
    orgSlug: string,
    userId: string,
    query: MyTicketsQuery
  ) => Effect.Effect<OrgTicketPage, NotFound>
  readonly recent: (
    orgSlug: string,
    userId: string
  ) => Effect.Effect<ReadonlyArray<OrgTicketRow>, NotFound>
  readonly sections: (
    orgSlug: string,
    userId: string,
    slug: string,
    query: TicketListQuery
  ) => Effect.Effect<TicketSections, NotFound | MarkdownError>
  readonly sprintSections: (
    orgSlug: string,
    userId: string,
    slug: string,
    query: TicketListQuery
  ) => Effect.Effect<TicketSprintSections, NotFound | MarkdownError>
  readonly list: (
    orgSlug: string,
    userId: string,
    slug: string,
    query: TicketListQuery,
    limit?: number
  ) => Effect.Effect<TicketListPage, NotFound | MarkdownError>
  readonly count: (
    orgSlug: string,
    userId: string,
    slug: string,
    query: TicketCountQuery
  ) => Effect.Effect<TicketCounts, NotFound | MarkdownError>
  readonly search: (
    orgSlug: string,
    userId: string,
    slug: string,
    options: TicketSearchQuery
  ) => Effect.Effect<ReadonlyArray<Ticket>, NotFound | MarkdownError>
  readonly listInGroup: (
    orgSlug: string,
    userId: string,
    slug: string,
    groupId: string
  ) => Effect.Effect<ReadonlyArray<Ticket>, NotFound | MarkdownError>
  readonly tagUsageCounts: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<Readonly<Record<string, number>>, NotFound | MarkdownError>
  readonly get: (
    orgSlug: string,
    ownerId: string,
    slug: string,
    id: string
  ) => Effect.Effect<TicketDetail, TicketReadError>
  readonly quickCreate: (
    orgSlug: string,
    ownerId: string,
    slug: string,
    input: QuickCreateTicketInput
  ) => Effect.Effect<TicketDetail, NotFound | Validation | MarkdownError>
  readonly create: (
    orgSlug: string,
    ownerId: string,
    slug: string,
    input: CreateTicketInput
  ) => Effect.Effect<
    TicketDetail,
    NotFound | Validation | MentionInvalid | MarkdownError
  >
  readonly update: (
    orgSlug: string,
    ownerId: string,
    slug: string,
    id: string,
    input: UpdateTicketInput,
    sort?: TicketSort
  ) => Effect.Effect<
    TicketUpdateResult,
    TicketReadError | Validation | MentionInvalid
  >
  readonly split: (
    orgSlug: string,
    userId: string,
    slug: string,
    id: string,
    input: SplitTicketInput
  ) => Effect.Effect<
    SplitTicketResult,
    | TicketReadError
    | Validation
    | MentionInvalid
    | Forbidden
    | SprintCompletedImmutable
  >
  readonly remove: (
    orgSlug: string,
    ownerId: string,
    slug: string,
    id: string
  ) => Effect.Effect<void, NotFound | MarkdownError>
  readonly archive: (
    orgSlug: string,
    userId: string,
    slug: string,
    id: string,
    reason?: string
  ) => Effect.Effect<
    TicketDetail,
    TicketReadError | MentionInvalid | InvalidCommentBody
  >
  readonly unarchive: (
    orgSlug: string,
    userId: string,
    slug: string,
    id: string
  ) => Effect.Effect<TicketDetail, TicketReadError>
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
    orgSlug: string,
    userId: string,
    slug: string,
    id: string,
    input: CreateBranchInput
  ) => Effect.Effect<
    TicketDetail,
    | NotFound
    | Conflict
    | BranchExists
    | BranchProtected
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
    | MarkdownError
    | MalformedTicketDocument
  >
  readonly attachBranch: (
    orgSlug: string,
    userId: string,
    slug: string,
    id: string,
    input: AttachBranchInput
  ) => Effect.Effect<
    TicketDetail,
    | NotFound
    | Conflict
    | BranchNotFound
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
    | MarkdownError
    | MalformedTicketDocument
  >
  readonly openPr: (
    orgSlug: string,
    userId: string,
    slug: string,
    id: string,
    input: OpenPrInput
  ) => Effect.Effect<
    OpenPrResult,
    | NotFound
    | Conflict
    | BranchProtected
    | GitHubTokenExpired
    | GitHubScopeInsufficient
    | RepoGone
    | RateLimited
    | GitHubError
    | MarkdownError
    | MalformedTicketDocument
  >
  readonly clearBranch: (
    orgSlug: string,
    userId: string,
    slug: string,
    id: string
  ) => Effect.Effect<TicketDetail, TicketReadError>
  readonly getGitState: (
    orgSlug: string,
    userId: string,
    slug: string,
    ticketId: string | undefined
  ) => Effect.Effect<GitStatesResponse, NotFound | MarkdownError>
  readonly listGitStates: (
    orgSlug: string,
    userId: string,
    slug: string
  ) => Effect.Effect<GitStatesResponse, NotFound | MarkdownError>
}

export class Tickets extends Context.Service<Tickets, TicketsShape>()(
  "@pp/server-core/tickets/Tickets"
) {}
