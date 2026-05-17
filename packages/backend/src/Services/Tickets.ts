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
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  GitStatesResponse,
  MentionInvalid,
  NotFound,
  OpenPrInput,
  OpenPrResult,
  QuickCreateTicketInput,
  RateLimited,
  RepoGone,
  Ticket,
  TicketDetail,
  TicketListPage,
  TicketListQuery,
  UpdateTicketInput,
  Validation
} from "@projectproject/shared"
import type { MarkdownError } from "./Markdown"
import type { MalformedTicketDocument } from "./TicketDocs"

type TicketReadError = NotFound | MarkdownError | MalformedTicketDocument

export interface TicketsShape {
  readonly list: (
    orgSlug: string,
    userId: string,
    slug: string,
    query: TicketListQuery
  ) => Effect.Effect<TicketListPage, NotFound | MarkdownError>
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
  ) => Effect.Effect<Ticket, NotFound | MarkdownError>
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
    input: UpdateTicketInput
  ) => Effect.Effect<TicketDetail, TicketReadError | Validation | MentionInvalid>
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

export class Tickets extends Context.Tag(
  "@projectproject/backend/Services/Tickets"
)<Tickets, TicketsShape>() {}
