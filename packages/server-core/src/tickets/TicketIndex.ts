import type {
  ChecksStatus,
  Estimate,
  PullRequestState,
  TagName,
  TicketId,
  TicketPriority,
  TicketStatus,
  TicketType,
  TicketCountQuery,
  TicketListQuery,
  TicketSort,
  TicketBranchEntry
} from "@pp/shared"
import type { NotFound } from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"

import type { MarkdownError } from "../markdown/Markdown"
import type { MalformedTicketDocument, TicketDocument } from "./TicketDocs"

export interface TicketIndexProject {
  readonly orgSlug: string
  readonly organizationId: string
  readonly projectId: string
  readonly projectSlug: string
}

export interface TicketIndexQueryOptions {
  readonly viewerId: string
  readonly ticketIds?: ReadonlyArray<string>
  readonly excludeTicketIds?: ReadonlyArray<string>
  readonly limit: number
}

export interface TicketIndexCountOptions {
  readonly viewerId: string
  readonly ticketIds?: ReadonlyArray<string>
  readonly excludeTicketIds?: ReadonlyArray<string>
}

export interface TicketIndexCounts {
  readonly total: number
  readonly byStatus: Readonly<Record<string, number>>
}

export type TicketIndexEntry = Readonly<{
  id: TicketId
  title: string
  status: TicketStatus
  type: TicketType
  priority: TicketPriority
  estimate: Estimate | null
  tags: ReadonlyArray<TagName>
  branch: string | null
  pr: number | null
  prState: PullRequestState | null
  prDraft: boolean
  prBase: string | null
  ignoredBranches: ReadonlyArray<string>
  lastTransitionedPr: number | null
  branchDeletedAt: Date | null
  checks: ChecksStatus | null
  checksHeadSha: string | null
  checksUpdatedAt: Date | null
  assignees: ReadonlyArray<string>
  parent: TicketId | null
  subTicketCount: number
  subTicketDoneCount: number
  archivedAt: Date | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}>

/** A section with `ticketIds` holds exactly those tickets; one without catches the rest. */
export type TicketIndexSection = Readonly<{
  key: string
  ticketIds?: ReadonlyArray<string>
}>

export type TicketIndexSectionsOptions = TicketIndexCountOptions &
  Readonly<{
    limit: number
    sections: "status" | "parent" | ReadonlyArray<TicketIndexSection>
  }>

export type TicketIndexSections = ReadonlyMap<
  string,
  Readonly<{
    counts: TicketIndexCounts
    entries: ReadonlyArray<TicketIndexQueryEntry>
  }>
>

export type TicketIndexQueryEntry = Readonly<{
  entry: TicketIndexEntry
  sortValue: string
  orderKey: string
}>

export type TicketIndexOrgEntry = Readonly<{
  project: TicketIndexProject
  entry: TicketIndexEntry
  sortValue: string
}>

export type TicketIndexTouchedEntry = TicketIndexOrgEntry &
  Readonly<{ lastCommentAt: Date | null }>

export type TicketIndexAssignedOptions = Readonly<{
  viewerId: string
  doneAfter: Date
  cursor?: string
  limit: number
}>

export type TicketIndexAssignedScope = Readonly<{
  viewerId: string
  doneAfter: Date
}>

export type TicketIndexProjectPreview = Readonly<{
  project: TicketIndexProject
  total: number
  entries: ReadonlyArray<TicketIndexEntry>
}>

export type TicketIndexTouchedOptions = Readonly<{
  viewerId: string
  limit: number
}>

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

export interface TicketIndexDrift {
  readonly missing: ReadonlyArray<string>
  readonly orphaned: ReadonlyArray<string>
  readonly stale: ReadonlyArray<string>
}

export interface TicketIndexReconcileProjectSummary {
  readonly project: TicketIndexProject
  readonly drift: TicketIndexDrift
  readonly rebuilt: boolean
  readonly indexed: number
  readonly skipped: number
}

export interface TicketIndexReconcileSummary {
  readonly projects: ReadonlyArray<TicketIndexReconcileProjectSummary>
  readonly reconciled: number
}

export interface TicketIndexReconcileOptions {
  readonly force?: boolean
}

export type TicketIndexShape = Readonly<{
  projectFor: (
    orgSlug: string,
    slug: string
  ) => Effect.Effect<TicketIndexProject, NotFound>
  projectsFor: (
    orgSlug: string,
    slugs: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<TicketIndexProject>>
  assignedTo: (
    projects: ReadonlyArray<TicketIndexProject>,
    options: TicketIndexAssignedOptions
  ) => Effect.Effect<ReadonlyArray<TicketIndexOrgEntry>>
  countAssignedByStatus: (
    projects: ReadonlyArray<TicketIndexProject>,
    scope: TicketIndexAssignedScope
  ) => Effect.Effect<
    ReadonlyArray<
      Readonly<{
        project: TicketIndexProject
        status: TicketStatus
        count: number
      }>
    >
  >
  assignedPerProject: (
    projects: ReadonlyArray<TicketIndexProject>,
    scope: TicketIndexAssignedScope & Readonly<{ perProject: number }>
  ) => Effect.Effect<ReadonlyArray<TicketIndexProjectPreview>>
  touchedBy: (
    projects: ReadonlyArray<TicketIndexProject>,
    options: TicketIndexTouchedOptions
  ) => Effect.Effect<ReadonlyArray<TicketIndexTouchedEntry>>
  list: (
    project: TicketIndexProject,
    ticketIds?: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<TicketIndexEntry>>
  query: (
    project: TicketIndexProject,
    query: TicketListQuery,
    options: TicketIndexQueryOptions
  ) => Effect.Effect<ReadonlyArray<TicketIndexQueryEntry>>
  querySections: (
    project: TicketIndexProject,
    query: TicketListQuery,
    options: TicketIndexSectionsOptions
  ) => Effect.Effect<TicketIndexSections>
  orderKeyFor: (
    project: TicketIndexProject,
    ticketId: string,
    sort: TicketSort
  ) => Effect.Effect<string | null>
  count: (
    project: TicketIndexProject,
    query: TicketCountQuery,
    options: TicketIndexCountOptions
  ) => Effect.Effect<TicketIndexCounts>
  listIds: (project: TicketIndexProject) => Effect.Effect<ReadonlyArray<string>>
  existingIds: (
    project: TicketIndexProject,
    ticketIds: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlySet<string>>
  reserveTicketNumber: (project: TicketIndexProject) => Effect.Effect<number>
  tagUsageCounts: (
    project: TicketIndexProject
  ) => Effect.Effect<Readonly<Record<string, number>>>
  findTicketIdsByTag: (
    project: TicketIndexProject,
    tag: string
  ) => Effect.Effect<ReadonlyArray<string>>
  findTicketIdsByStatus: (
    project: TicketIndexProject,
    status: string
  ) => Effect.Effect<ReadonlyArray<string>>
  findTicketsByBranch: (
    projectId: string,
    branch: string
  ) => Effect.Effect<ReadonlyArray<TicketIndexMatch>>
  findStackLayers: (
    projectId: string,
    branch: string
  ) => Effect.Effect<ReadonlyArray<TicketIndexMatch>>
  stacksFor: (
    project: TicketIndexProject,
    ticketIds?: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyMap<string, ReadonlyArray<TicketBranchEntry>>>
  findMergesAwaiting: (
    projectId: string,
    base: string
  ) => Effect.Effect<
    ReadonlyArray<TicketIndexMatch & Readonly<{ stacked: boolean }>>
  >
  isRepositoryBranchAttached: (
    repoId: string,
    branch: string,
    stackedOnly?: boolean
  ) => Effect.Effect<boolean>
  getBranchDeletedAt: (
    orgSlug: string,
    slug: string,
    ticketId: string
  ) => Effect.Effect<Date | null>
  upsertTicket: (
    project: TicketIndexProject,
    document: TicketDocument
  ) => Effect.Effect<void>
  markBranchStale: (
    projectId: string,
    branch: string,
    deletedAt: Date
  ) => Effect.Effect<ReadonlyArray<string>>
  clearBranchStale: (
    project: TicketIndexProject,
    ticketIds: ReadonlyArray<string>
  ) => Effect.Effect<void>
  updateBranchChecks: (
    projectId: string,
    branch: string,
    checks: ChecksStatus,
    headSha: string,
    updatedAt: Date
  ) => Effect.Effect<ReadonlyArray<string>>
  deleteTicket: (
    project: TicketIndexProject,
    ticketId: string
  ) => Effect.Effect<void>
  rebuildProject: (
    project: TicketIndexProject
  ) => Effect.Effect<
    TicketIndexRebuildProjectSummary,
    MarkdownError | MalformedTicketDocument
  >
  rebuildAllProjects: () => Effect.Effect<
    TicketIndexRebuildSummary,
    MarkdownError | MalformedTicketDocument
  >
  reconcileProject: (
    project: TicketIndexProject,
    options?: TicketIndexReconcileOptions
  ) => Effect.Effect<
    TicketIndexReconcileProjectSummary,
    MarkdownError | MalformedTicketDocument
  >
  reconcileAllProjects: () => Effect.Effect<
    TicketIndexReconcileSummary,
    MarkdownError | MalformedTicketDocument
  >
}>

export class TicketIndex extends Context.Service<
  TicketIndex,
  TicketIndexShape
>()("@pp/server-core/tickets/TicketIndex") {}
