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
  TicketPageQuery,
  TicketSort
} from "@pp/shared"
import type { NotFound } from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"

import type { TicketDocument } from "./TicketDocs"
import type { TicketProject } from "./ticketProject"

export interface TicketIndexQueryOptions {
  readonly viewerId: string
  readonly ticketIds?: ReadonlyArray<string>
  readonly excludeTicketIds?: ReadonlyArray<string>
  readonly sectionTicketIds?: ReadonlyArray<string>
  readonly attachableTo?: TicketIndexAttachable
  readonly limit: number
}

export type TicketIndexAttachable = Readonly<{
  parent: string
  leavesOnly: boolean
}>

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
  project: TicketProject
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
  project: TicketProject
  total: number
  entries: ReadonlyArray<TicketIndexEntry>
}>

export type TicketIndexTouchedOptions = Readonly<{
  viewerId: string
  limit: number
}>

export type TicketIndexMatch = TicketProject &
  Readonly<{
    ticketId: string
    branch: string
  }>

export interface TicketIndexRebuildProjectSummary {
  readonly project: TicketProject
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
  readonly project: TicketProject
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
  ) => Effect.Effect<TicketProject, NotFound>
  projectsFor: (
    orgSlug: string,
    slugs: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<TicketProject>>
  assignedTo: (
    projects: ReadonlyArray<TicketProject>,
    options: TicketIndexAssignedOptions
  ) => Effect.Effect<ReadonlyArray<TicketIndexOrgEntry>>
  countAssignedByStatus: (
    projects: ReadonlyArray<TicketProject>,
    scope: TicketIndexAssignedScope
  ) => Effect.Effect<
    ReadonlyArray<
      Readonly<{
        project: TicketProject
        status: TicketStatus
        count: number
      }>
    >
  >
  assignedPerProject: (
    projects: ReadonlyArray<TicketProject>,
    scope: TicketIndexAssignedScope & Readonly<{ perProject: number }>
  ) => Effect.Effect<ReadonlyArray<TicketIndexProjectPreview>>
  touchedBy: (
    projects: ReadonlyArray<TicketProject>,
    options: TicketIndexTouchedOptions
  ) => Effect.Effect<ReadonlyArray<TicketIndexTouchedEntry>>
  list: (
    project: TicketProject,
    ticketIds?: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlyArray<TicketIndexEntry>>
  query: (
    project: TicketProject,
    query: TicketPageQuery,
    options: TicketIndexQueryOptions
  ) => Effect.Effect<ReadonlyArray<TicketIndexQueryEntry>>
  querySections: (
    project: TicketProject,
    query: TicketListQuery,
    options: TicketIndexSectionsOptions
  ) => Effect.Effect<TicketIndexSections>
  orderKeyFor: (
    project: TicketProject,
    ticketId: string,
    sort: TicketSort
  ) => Effect.Effect<string | null>
  count: (
    project: TicketProject,
    query: TicketCountQuery,
    options: TicketIndexCountOptions
  ) => Effect.Effect<TicketIndexCounts>
  listIds: (project: TicketProject) => Effect.Effect<ReadonlyArray<string>>
  existingIds: (
    project: TicketProject,
    ticketIds: ReadonlyArray<string>
  ) => Effect.Effect<ReadonlySet<string>>
  reserveTicketNumber: (project: TicketProject) => Effect.Effect<number>
  tagUsageCounts: (
    project: TicketProject
  ) => Effect.Effect<Readonly<Record<string, number>>>
  findTicketIdsByTag: (
    project: TicketProject,
    tag: string
  ) => Effect.Effect<ReadonlyArray<string>>
  findTicketIdsByStatus: (
    project: TicketProject,
    status: string
  ) => Effect.Effect<ReadonlyArray<string>>
  upsertTicket: (
    project: TicketProject,
    document: TicketDocument
  ) => Effect.Effect<void>
  deleteTicket: (
    project: TicketProject,
    ticketId: string
  ) => Effect.Effect<void>
}>

export class TicketIndex extends Context.Service<
  TicketIndex,
  TicketIndexShape
>()("@pp/server-core/tickets/TicketIndex") {}
