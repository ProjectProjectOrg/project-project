import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type {
  PullRequestState,
  TagName,
  TicketId,
  TicketPriority,
  TicketStatus,
  TicketType
} from "@projectproject/shared"
import type { NotFound } from "@projectproject/shared"
import type { MarkdownError } from "./Markdown"
import type { MalformedTicketDocument, TicketDocument } from "./TicketDocs"

export interface TicketIndexProject {
  readonly orgSlug: string
  readonly organizationId: string
  readonly projectId: string
  readonly projectSlug: string
}

export interface TicketIndexEntry {
  readonly id: TicketId
  readonly title: string
  readonly status: TicketStatus
  readonly type: TicketType
  readonly priority: TicketPriority
  readonly tags: ReadonlyArray<TagName>
  readonly branch: string | null
  readonly pr: number | null
  readonly prState: PullRequestState | null
  readonly lastTransitionedPr: number | null
  readonly assignees: ReadonlyArray<string>
  readonly createdBy: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface TicketIndexMatch extends TicketIndexProject {
  readonly ticketId: string
  readonly branch: string
}

export interface TicketIndexRebuildProjectSummary {
  readonly project: TicketIndexProject
  readonly indexed: number
  readonly skipped: number
}

export interface TicketIndexRebuildSummary {
  readonly projects: ReadonlyArray<TicketIndexRebuildProjectSummary>
}

export interface TicketIndexShape {
  readonly projectFor: (
    orgSlug: string,
    slug: string
  ) => Effect.Effect<TicketIndexProject, NotFound>
  readonly list: (
    project: TicketIndexProject,
    ticketIds?: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<TicketIndexEntry>>
  readonly listIds: (
    project: TicketIndexProject
  ) => Effect.Effect<ReadonlyArray<string>>
  readonly tagUsageCounts: (
    project: TicketIndexProject
  ) => Effect.Effect<Readonly<Record<string, number>>>
  readonly findTicketIdsByTag: (
    project: TicketIndexProject,
    tag: string
  ) => Effect.Effect<ReadonlyArray<string>>
  readonly findTicketsByBranch: (
    projectId: string,
    branch: string
  ) => Effect.Effect<ReadonlyArray<TicketIndexMatch>>
  readonly upsertTicket: (
    project: TicketIndexProject,
    document: TicketDocument
  ) => Effect.Effect<void>
  readonly deleteTicket: (
    project: TicketIndexProject,
    ticketId: string
  ) => Effect.Effect<void>
  readonly rebuildProject: (
    project: TicketIndexProject
  ) => Effect.Effect<
    TicketIndexRebuildProjectSummary,
    MarkdownError | MalformedTicketDocument
  >
  readonly rebuildAllProjects: () => Effect.Effect<
    TicketIndexRebuildSummary,
    MarkdownError | MalformedTicketDocument
  >
}

export class TicketIndex extends Context.Tag(
  "@projectproject/backend/Services/TicketIndex"
)<TicketIndex, TicketIndexShape>() {}
