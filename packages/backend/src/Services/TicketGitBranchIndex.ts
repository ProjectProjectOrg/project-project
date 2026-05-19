import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export interface TicketGitBranchIndexConnection {
  readonly projectIntegrationLinkId: string
  readonly organizationId: string
  readonly projectId: string
  readonly projectSlug: string
}

export interface TicketGitBranchIndexEntry {
  readonly ticketId: string
  readonly branch: string
}

export interface TicketGitBranchIndexMatch {
  readonly organizationId: string
  readonly organizationSlug: string
  readonly projectId: string
  readonly projectSlug: string
  readonly ticketId: string
  readonly branch: string
}

export interface TicketGitBranchIndexShape {
  readonly upsertTicketBranch: (
    connection: TicketGitBranchIndexConnection,
    ticketId: string,
    branch: string
  ) => Effect.Effect<void>
  readonly clearTicket: (
    projectIntegrationLinkId: string,
    ticketId: string
  ) => Effect.Effect<void>
  readonly clearProjectConnection: (
    projectIntegrationLinkId: string
  ) => Effect.Effect<void>
  readonly rebuildProjectConnection: (
    connection: TicketGitBranchIndexConnection,
    tickets: ReadonlyArray<TicketGitBranchIndexEntry>
  ) => Effect.Effect<void>
  readonly findTicketsByBranch: (
    projectIntegrationLinkId: string,
    branch: string
  ) => Effect.Effect<ReadonlyArray<TicketGitBranchIndexMatch>>
}

export class TicketGitBranchIndex extends Context.Tag(
  "@projectproject/backend/Services/TicketGitBranchIndex"
)<TicketGitBranchIndex, TicketGitBranchIndexShape>() {}
