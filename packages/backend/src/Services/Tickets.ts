import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  AttachBranchInput,
  BranchExists,
  BranchNotFound,
  BranchProtected,
  Conflict,
  CreateBranchInput,
  CreateTicketInput,
  CursorPayload,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  GitStatesResponse,
  NotFound,
  OpenPrInput,
  OpenPrResult,
  RateLimited,
  RepoGone,
  Ticket,
  TicketDetail,
  TicketFilter,
  UpdateTicketInput
} from "@projectproject/shared"
import type { MarkdownError } from "./Markdown"

export interface TicketsShape {
  readonly list: (
    orgSlug: string,
    ownerId: string,
    slug: string
  ) => Effect.Effect<ReadonlyArray<Ticket>, NotFound | MarkdownError>
  readonly get: (
    orgSlug: string,
    ownerId: string,
    slug: string,
    id: string
  ) => Effect.Effect<TicketDetail, NotFound | MarkdownError>
  readonly create: (
    orgSlug: string,
    ownerId: string,
    slug: string,
    input: CreateTicketInput
  ) => Effect.Effect<Ticket, NotFound | MarkdownError>
  readonly update: (
    orgSlug: string,
    ownerId: string,
    slug: string,
    id: string,
    input: UpdateTicketInput
  ) => Effect.Effect<TicketDetail, NotFound | MarkdownError>
  readonly remove: (
    orgSlug: string,
    ownerId: string,
    slug: string,
    id: string
  ) => Effect.Effect<void, NotFound | MarkdownError>
  readonly replaceTag: (
    orgSlug: string,
    slug: string,
    id: string,
    oldName: string,
    newName: string | null
  ) => Effect.Effect<boolean, NotFound | MarkdownError>
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
  >
  readonly clearBranch: (
    orgSlug: string,
    userId: string,
    slug: string,
    id: string
  ) => Effect.Effect<TicketDetail, NotFound | MarkdownError>
  readonly listPaged: (
    orgSlug: string,
    userId: string,
    slug: string,
    filter: TicketFilter | undefined,
    cursor: CursorPayload | undefined,
    limit: number
  ) => Effect.Effect<
    { items: ReadonlyArray<Ticket>; nextCursor: string | null },
    NotFound | MarkdownError
  >
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

export class Tickets extends Context.Tag(
  "@projectproject/backend/Services/Tickets"
)<Tickets, TicketsShape>() {}
