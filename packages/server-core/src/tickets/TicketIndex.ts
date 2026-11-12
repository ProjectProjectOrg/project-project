import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  commentIndex,
  organization,
  projectIndex,
  projectStatus,
  ticketActivity,
  ticketBranch,
  ticketIndex,
  ticketRelationIndex
} from "@pp/db/schema"
import {
  type ActivityActor,
  type ChecksStatus,
  type PullRequestState,
  type TicketFlag,
  type TicketPriority,
  type TicketParent,
  type TypeKey,
  NO_TYPE_FILTER,
  ESTIMATE_SIZES,
  EPIC_SECTION_NONE,
  Estimate,
  estimateRank,
  formatMovedFrom,
  parseTicketMentionId,
  NotFound,
  TagName,
  TicketActivityChange,
  TicketId,
  TicketRank,
  tryDecodeCursor,
  type EstimateFilterValue,
  type TicketCountQuery,
  type TicketFilter,
  type TicketListQuery,
  type TicketNeighbor,
  type TicketNeighbors,
  type TicketPageQuery,
  type TicketSection,
  type TicketSort,
  type TicketRelations,
  type ParentFilter,
  type TypeFilter,
  TicketStatus,
  EPIC_TYPE
} from "@pp/shared"
import {
  and,
  arrayContains,
  arrayOverlaps,
  asc,
  count as drizzleCount,
  desc,
  eq,
  exists,
  getTableColumns,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  notInArray,
  or,
  sql as drizzleSql,
  type SQL
} from "drizzle-orm"
import { alias, type AnyPgColumn } from "drizzle-orm/pg-core"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"

import { actorOf, type ActorColumns } from "../activity/actorRow"
import type * as TicketDocs from "./TicketDocs"
import * as TicketIndexRepairs from "./TicketIndexRepairs"
import type { TicketProject } from "./ticketProject"
import {
  relationsFromRows,
  type RelationEdge,
  type RelationRow
} from "./ticketRelations"

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
  type: TypeKey | null
  priority: TicketPriority
  rank: TicketRank
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
  parent: TicketParent | null
  subTicketCount: number
  subTicketDoneCount: number
  subTicketsInSection?: number
  openBlockerCount: number
  openBlockingCount: number
  relatedCount: number
  duplicateCount: number
  flag: TicketFlag | null
  archivedAt: Date | null
  createdBy: string
  createdAt: Date
  updatedAt: Date
}>

export type TicketRankGap = Readonly<{
  lower: TicketRank | null
  upper: TicketRank | null
}>

/** A section with `ticketIds` holds exactly those tickets; one without catches the rest. */
export type TicketIndexSection = Readonly<{
  key: string
  ticketIds?: ReadonlyArray<string>
}>

export type TicketIndexSectionsOptions = TicketIndexCountOptions &
  Readonly<{
    limit: number
    sections:
      | "status"
      | "parent"
      | "ticketParent"
      | ReadonlyArray<TicketIndexSection>
  }>

export type TicketIndexSections = ReadonlyMap<
  string,
  Readonly<{
    counts: TicketIndexCounts
    entries: ReadonlyArray<TicketIndexQueryEntry>
  }>
>

export type TicketIndexSectionOrder =
  | Readonly<{ kind: "status" }>
  | Readonly<{ kind: "parent" | "ticketParent"; keys: ReadonlyArray<string> }>
  | Readonly<{ kind: "explicit"; sections: ReadonlyArray<TicketIndexSection> }>

export type TicketIndexWithinOrder = Readonly<{
  sort: TicketSort
  nestAcrossSections?: boolean
}>

export type TicketIndexNeighborsOptions = TicketIndexCountOptions &
  Readonly<{
    ticketId: string
    sections: TicketIndexSectionOrder
    within: TicketIndexWithinOrder
  }>

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

export type TicketIndexTouchedEvent = Readonly<{
  occurredAt: Date
  actor: ActivityActor["Service"]
  change: TicketActivityChange
}>

export type TicketIndexTouchedEntry = TicketIndexOrgEntry &
  Readonly<{
    lastCommentAt: Date | null
    assignedEvent: TicketIndexTouchedEvent | null
    statusEvent: TicketIndexTouchedEvent | null
  }>

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
  gitProjectIds: ReadonlyArray<string>
  limit: number
}>

export type MovedTicketRow = Readonly<{
  projectSlug: string
  ticketId: string
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

export class TicketIndex extends Context.Service<
  TicketIndex,
  Readonly<{
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
    neighbors: (
      project: TicketProject,
      query: TicketListQuery,
      options: TicketIndexNeighborsOptions
    ) => Effect.Effect<TicketNeighbors | null>
    orderKeyFor: (
      project: TicketProject,
      ticketId: string,
      sort: TicketSort
    ) => Effect.Effect<string | null>
    topRank: (project: TicketProject) => Effect.Effect<TicketRank | null>
    rankGap: (
      project: TicketProject,
      anchorId: string,
      side: "after" | "before",
      excludeId: string
    ) => Effect.Effect<TicketRankGap | null>
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
    mentionableIds: (
      project: TicketProject,
      mentionIds: ReadonlyArray<string>
    ) => Effect.Effect<ReadonlySet<string>>
    movedTo: (
      project: TicketProject,
      ticketId: string
    ) => Effect.Effect<MovedTicketRow | null>
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
      document: TicketDocs.TicketDocument
    ) => Effect.Effect<void>
    deleteTicket: (
      project: TicketProject,
      ticketId: string
    ) => Effect.Effect<void>
    parentOf: (
      project: TicketProject,
      ticketId: string
    ) => Effect.Effect<TicketParent | null>
    relationsOf: (
      project: TicketProject,
      ticketId: string
    ) => Effect.Effect<TicketRelations>
    relationEdges: (
      project: TicketProject
    ) => Effect.Effect<ReadonlyArray<RelationEdge>>
  }>
>()("@pp/server-core/tickets/TicketIndex") {}

const makeTicketId = Schema.decodeUnknownSync(TicketId)
const makeTagName = Schema.decodeUnknownSync(TagName)
const decodeEstimate = Schema.decodeUnknownOption(Estimate)
const decodeActivityChange = Schema.decodeUnknownSync(TicketActivityChange)

const neighborOf = (
  id: string | null,
  title: string | null
): TicketNeighbor | null =>
  id === null || title === null ? null : { id: makeTicketId(id), title }

const touchedEventOf = (
  row:
    | (ActorColumns & Readonly<{ occurredAt: Date | null; change: unknown }>)
    | null
): TicketIndexTouchedEvent | null =>
  row === null || row.occurredAt === null
    ? null
    : {
        occurredAt: row.occurredAt,
        actor: actorOf(row),
        change: decodeActivityChange(row.change)
      }

const estimateFromIndex = (
  unit: (typeof ticketIndex.$inferSelect)["estimateUnit"],
  value: number | null
): Estimate | null => {
  if (unit === null || value === null) return null
  const candidate = Match.value(unit).pipe(
    Match.when("time", (unit) => ({ unit, minutes: value })),
    Match.when("tshirt", (unit) => ({
      unit,
      value: ESTIMATE_SIZES[value - 1]
    })),
    Match.orElse((unit) => ({ unit, value }))
  )
  return Option.getOrNull(decodeEstimate(candidate))
}

export const ticketIndexRowFor = (
  project: TicketProject,
  document: TicketDocs.TicketDocument
): typeof ticketIndex.$inferInsert => ({
  organizationId: project.organizationId,
  projectId: project.projectId,
  ticketId: document.id,
  title: document.title,
  status: document.status,
  type: document.type,
  priority: document.priority,
  rank: document.rank,
  estimateUnit: document.estimate?.unit ?? null,
  estimateValue: document.estimate ? estimateRank(document.estimate) : null,
  tags: [...document.tags],
  assignees: [...document.assignees],
  parent: document.parent ?? null,
  movedFrom: [...(document.movedFrom ?? [])],
  branch: document.branch,
  pr: document.pr,
  prState: document.prState,
  prDraft: document.prDraft ?? false,
  prBase: document.prBase ?? null,
  lastTransitionedPr: document.lastTransitionedPr,
  ignoredBranches: [...(document.ignoredBranches ?? [])],
  archivedAt: document.archivedAt,
  flagReason: document.flag?.reason ?? null,
  flaggedBy: document.flag?.by ?? null,
  flaggedAt: document.flag?.at ?? null,
  createdBy: document.createdBy,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt
})

const flagFromIndex = (
  row: Pick<
    typeof ticketIndex.$inferSelect,
    "flagReason" | "flaggedBy" | "flaggedAt"
  >
): TicketFlag | null => {
  if (row.flaggedBy === null || row.flaggedAt === null) return null
  return row.flagReason === null
    ? { by: row.flaggedBy, at: row.flaggedAt }
    : { reason: row.flagReason, by: row.flaggedBy, at: row.flaggedAt }
}

export const ticketBranchRowsFor = (
  project: TicketProject,
  document: TicketDocs.TicketDocument
): ReadonlyArray<typeof ticketBranch.$inferInsert> =>
  (document.stack ?? []).map((layer, position) => ({
    projectId: project.projectId,
    ticketId: document.id,
    branch: layer.branch,
    position,
    base: layer.base ?? null,
    pr: layer.pr ?? null,
    prState: layer.prState ?? null,
    prDraft: layer.prDraft ?? false,
    landed: layer.landed ?? false
  }))

export const ticketRelationRowsFor = (
  project: TicketProject,
  document: TicketDocs.TicketDocument
): ReadonlyArray<typeof ticketRelationIndex.$inferInsert> => {
  const edges = [
    ...(document.blockedBy ?? []).map((to) => ({
      to,
      kind: "blocked_by" as const
    })),
    ...(document.relatedTo ?? []).map((to) => ({
      to,
      kind: "related" as const
    })),
    ...(document.duplicateOf === undefined
      ? []
      : [{ to: document.duplicateOf, kind: "duplicate_of" as const }])
  ]
  const seen = new Set<string>()
  return edges.flatMap(({ to, kind }) => {
    const key = `${kind}:${to}`
    if (to === document.id || seen.has(key)) return []
    seen.add(key)
    return [
      {
        projectId: project.projectId,
        fromTicketId: document.id,
        toTicketId: to,
        kind
      }
    ]
  })
}

const ticketIdSortExpression = drizzleSql<string>`case
  when ${ticketIndex.ticketId} ~ '-[0-9]+$' then
    case
      when length(substring(${ticketIndex.ticketId} from '[0-9]+$')) < 10
        then lpad(substring(${ticketIndex.ticketId} from '[0-9]+$'), 10, '0')
      else substring(${ticketIndex.ticketId} from '[0-9]+$')
    end
  else ${ticketIndex.ticketId}
end`

const ticketPrioritySortExpression = drizzleSql<string>`case ${ticketIndex.priority}
  when 'high' then '03'
  when 'med' then '02'
  else '01'
end`

const projectEstimationExpression = drizzleSql`(select ${projectIndex.estimation} from ${projectIndex} where ${projectIndex.id} = ${ticketIndex.projectId})`

const activeEstimateCondition = drizzleSql`${ticketIndex.estimateUnit} = ${projectEstimationExpression}`

const ticketEstimateSortExpression = drizzleSql<string>`case
  when ${activeEstimateCondition} then lpad(${ticketIndex.estimateValue}::text, 6, '0')
  else '000000'
end`

const activeEstimateSizeCondition = (rank: number): SQL =>
  drizzleSql`(${activeEstimateCondition} and ${ticketIndex.estimateUnit} = 'tshirt' and ${ticketIndex.estimateValue} = ${rank})`

const estimateFilterCondition = (value: EstimateFilterValue): SQL => {
  switch (value) {
    case "none":
      return drizzleSql`${ticketIndex.estimateUnit} is distinct from ${projectEstimationExpression}`
    case "any":
      return activeEstimateCondition
    case "stale":
      return drizzleSql`(${ticketIndex.estimateUnit} is not null and ${ticketIndex.estimateUnit} is distinct from ${projectEstimationExpression})`
    default:
      return activeEstimateSizeCondition(ESTIMATE_SIZES.indexOf(value) + 1)
  }
}

export const ticketSortExpression = (sort: TicketSort): SQL<string | Date> => {
  switch (sort.key) {
    case "manual":
      return drizzleSql`${ticketIndex.rank} collate "C"`
    case "id":
      return ticketIdSortExpression
    case "created":
      return drizzleSql`${ticketIndex.createdAt}`
    case "updated":
      return drizzleSql`${ticketIndex.updatedAt}`
    case "title":
      return drizzleSql`lower(${ticketIndex.title}) collate "C"`
    case "priority":
      return ticketPrioritySortExpression
    case "estimate":
      return ticketEstimateSortExpression
  }
  throw new Error("unsupported ticket sort key")
}

export const TICKET_ORDER_KEY_SEPARATOR = "\u0000"

const sortValueText = (sortValue: string | Date): string =>
  sortValue instanceof Date ? sortValue.toISOString() : sortValue

const toOrderKey = (sortValue: string, ticketId: string): string =>
  `${sortValue}${TICKET_ORDER_KEY_SEPARATOR}${ticketId}`

const cursorSortValue = (
  sort: TicketSort,
  value: string
): string | Date | undefined => {
  if (sort.key !== "created" && sort.key !== "updated") return value
  const date = DateTime.make(value)
  return Option.isSome(date) ? DateTime.toDate(date.value) : undefined
}

export const ticketCursorCondition = (
  query: TicketListQuery,
  expression: SQL<string | Date>
): SQL | undefined => {
  const cursor = tryDecodeCursor(query.cursor)
  if (!cursor) return undefined
  const value = cursorSortValue(query.sort, cursor.sort)
  if (value === undefined) return undefined
  const ascending = query.sort.dir === "asc"
  const afterPrimary = ascending
    ? drizzleSql`${expression} > ${value}`
    : drizzleSql`${expression} < ${value}`
  return or(
    afterPrimary,
    and(
      drizzleSql`${expression} = ${value}`,
      ascending
        ? gt(ticketIndex.ticketId, cursor.id)
        : lt(ticketIndex.ticketId, cursor.id)
    )
  )
}

const UPDATED_DESC: TicketSort = { key: "updated", dir: "desc" }

const columnOf = (table: SQL, column: AnyPgColumn): SQL =>
  drizzleSql`${table}.${drizzleSql.identifier(column.name)}`

const parentRow = drizzleSql`${ticketIndex}`
const childRow = drizzleSql`${drizzleSql.identifier("child_tickets")}`

const isChildRow = drizzleSql`${columnOf(childRow, ticketIndex.projectId)} = ${columnOf(parentRow, ticketIndex.projectId)}
  and ${columnOf(childRow, ticketIndex.parent)} = ${columnOf(parentRow, ticketIndex.ticketId)}`

const finishedStatus = (
  row: SQL
): SQL => drizzleSql`(${columnOf(row, ticketIndex.status)} = 'done' or exists (
  select 1 from ${projectStatus} s
  join ${projectStatus} anchor
    on anchor.project_id = s.project_id and anchor.slug = 'done'
  where s.project_id = ${columnOf(row, ticketIndex.projectId)}
    and s.slug = ${columnOf(row, ticketIndex.status)}
    and s.slug not in ('todo', 'in_progress')
    and s.order_key collate "C" > anchor.order_key collate "C"
))`

const parentTicketRow = drizzleSql`${drizzleSql.identifier("parent_ticket")}`

const epicSection = drizzleSql`coalesce((
  select case when ${columnOf(parentTicketRow, ticketIndex.type)} = 'epic'
    then ${columnOf(parentTicketRow, ticketIndex.ticketId)}
    else ${columnOf(parentTicketRow, ticketIndex.parent)} end
  from ${ticketIndex} as ${parentTicketRow}
  where ${columnOf(parentTicketRow, ticketIndex.projectId)} = ${columnOf(parentRow, ticketIndex.projectId)}
    and ${columnOf(parentTicketRow, ticketIndex.ticketId)} = ${columnOf(parentRow, ticketIndex.parent)}
), ${EPIC_SECTION_NONE}::text)`

const epicSectionCondition = (epics: ReadonlyArray<ParentFilter>): SQL =>
  drizzleSql`${epicSection} = any(${drizzleSql.param([...epics])}::text[])`

const ticketParentSection = drizzleSql`coalesce((
  select ${columnOf(parentTicketRow, ticketIndex.ticketId)}
  from ${ticketIndex} as ${parentTicketRow}
  where ${columnOf(parentTicketRow, ticketIndex.projectId)} = ${columnOf(parentRow, ticketIndex.projectId)}
    and ${columnOf(parentTicketRow, ticketIndex.ticketId)} = ${columnOf(parentRow, ticketIndex.parent)}
    and ${columnOf(parentTicketRow, ticketIndex.type)} is distinct from 'epic'
), ${EPIC_SECTION_NONE}::text)`

const ticketParentSectionCondition = (
  parents: ReadonlyArray<ParentFilter>
): SQL =>
  drizzleSql`${ticketParentSection} = any(${drizzleSql.param([...parents])}::text[])`

const childTicketCount = (condition: SQL) =>
  drizzleSql<number>`(
  select count(*) from ${ticketIndex} as ${childRow}
  where ${isChildRow}
    and ${columnOf(childRow, ticketIndex.archivedAt)} is null
    and ${condition}
)`.mapWith(Number)

const linkedRow = drizzleSql`${drizzleSql.identifier("linked_tickets")}`

const relationEnds = {
  out: { self: "from_ticket_id", other: "to_ticket_id" },
  in: { self: "to_ticket_id", other: "from_ticket_id" }
} as const

const directedCountOf = (
  row: SQL,
  direction: keyof typeof relationEnds,
  kind: "blocked_by" | "duplicate_of",
  condition: SQL
) => {
  const { self, other } = relationEnds[direction]
  return drizzleSql<number>`(
  select count(*) from ${ticketRelationIndex} r
  join ${ticketIndex} as ${linkedRow}
    on ${columnOf(linkedRow, ticketIndex.projectId)} = r.project_id
    and ${columnOf(linkedRow, ticketIndex.ticketId)} = r.${drizzleSql.identifier(other)}
  where r.project_id = ${columnOf(row, ticketIndex.projectId)}
    and r.${drizzleSql.identifier(self)} = ${columnOf(row, ticketIndex.ticketId)}
    and r.kind = ${kind}
    and ${condition}
)`
}

const isOpenLinked = drizzleSql`${columnOf(linkedRow, ticketIndex.archivedAt)} is null
    and not ${finishedStatus(linkedRow)}`

const openBlockerCountOf = (row: SQL) =>
  directedCountOf(row, "out", "blocked_by", isOpenLinked)

const relatedCountOf = (row: SQL) => drizzleSql<number>`(
  select count(distinct ${columnOf(linkedRow, ticketIndex.ticketId)})
  from ${ticketRelationIndex} r
  join ${ticketIndex} as ${linkedRow}
    on ${columnOf(linkedRow, ticketIndex.projectId)} = r.project_id
    and ${columnOf(linkedRow, ticketIndex.ticketId)} = case
      when r.from_ticket_id = ${columnOf(row, ticketIndex.ticketId)}
      then r.to_ticket_id
      else r.from_ticket_id
    end
  where r.project_id = ${columnOf(row, ticketIndex.projectId)}
    and (
      r.from_ticket_id = ${columnOf(row, ticketIndex.ticketId)}
      or r.to_ticket_id = ${columnOf(row, ticketIndex.ticketId)}
    )
    and r.kind = 'related'
    and ${columnOf(linkedRow, ticketIndex.archivedAt)} is null
)`

const parentColumn = (column: AnyPgColumn) => drizzleSql`(
  select ${columnOf(parentTicketRow, column)} from ${ticketIndex} as ${parentTicketRow}
  where ${columnOf(parentTicketRow, ticketIndex.projectId)} = ${columnOf(parentRow, ticketIndex.projectId)}
    and ${columnOf(parentTicketRow, ticketIndex.ticketId)} = ${columnOf(parentRow, ticketIndex.parent)}
)`

const entryColumns = {
  ...getTableColumns(ticketIndex),
  parentTitle: parentColumn(ticketIndex.title)
    .mapWith(ticketIndex.title)
    .as("parent_title"),
  parentType: parentColumn(ticketIndex.type)
    .mapWith(ticketIndex.type)
    .as("parent_type"),
  subTicketCount: childTicketCount(drizzleSql`true`).as("sub_ticket_count"),
  subTicketDoneCount: childTicketCount(finishedStatus(childRow)).as(
    "sub_ticket_done_count"
  ),
  openBlockerCount: openBlockerCountOf(parentRow)
    .mapWith(Number)
    .as("open_blocker_count"),
  openBlockingCount: directedCountOf(
    parentRow,
    "in",
    "blocked_by",
    isOpenLinked
  )
    .mapWith(Number)
    .as("open_blocking_count"),
  relatedCount: relatedCountOf(parentRow).mapWith(Number).as("related_count"),
  duplicateCount: directedCountOf(
    parentRow,
    "in",
    "duplicate_of",
    drizzleSql`true`
  )
    .mapWith(Number)
    .as("duplicate_count")
}

type TicketIndexRow = typeof ticketIndex.$inferSelect

type EntryRow = TicketIndexRow &
  Readonly<{
    parentTitle: TicketIndexRow["title"] | null
    parentType: TicketIndexRow["type"] | null
    subTicketCount: number
    subTicketDoneCount: number
    subTicketsInSection?: number | null
    openBlockerCount: number
    openBlockingCount: number
    relatedCount: number
    duplicateCount: number
  }>

const notEpic = drizzleSql`${ticketIndex.type} is distinct from ${EPIC_TYPE}`

const typeCondition = (types: ReadonlyArray<TypeFilter>): SQL => {
  const keys = types.flatMap((type) => (type === NO_TYPE_FILTER ? [] : [type]))
  const conditions: Array<SQL> = []
  if (types.includes(NO_TYPE_FILTER)) conditions.push(isNull(ticketIndex.type))
  if (keys.length > 0) conditions.push(inArray(ticketIndex.type, keys))
  return or(...conditions) ?? drizzleSql`false`
}

const attachableConditions = (
  attachable: TicketIndexAttachable | undefined
): ReadonlyArray<SQL> =>
  attachable === undefined
    ? []
    : [
        notEpic,
        ne(ticketIndex.ticketId, attachable.parent),
        drizzleSql`${ticketIndex.parent} is distinct from ${attachable.parent}`,
        ...(attachable.leavesOnly
          ? [
              drizzleSql`not exists (
                select 1 from ${ticketIndex} as ${childRow}
                where ${isChildRow}
              )`
            ]
          : [])
      ]

const escapedLikePattern = (value: string): string =>
  `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`

const statusCondition = (status: ReadonlyArray<string>): SQL =>
  status.length === 0
    ? drizzleSql`false`
    : inArray(ticketIndex.status, [...status])

const parentCondition = (parents: ReadonlyArray<ParentFilter>): SQL => {
  const parentIds = parents.filter((parent) => parent !== "none")
  const conditions: Array<SQL> = []
  if (parents.includes("none")) conditions.push(isNull(ticketIndex.parent))
  if (parentIds.length > 0) {
    conditions.push(inArray(ticketIndex.parent, parentIds))
  }
  return or(...conditions) ?? drizzleSql`false`
}

const ticketIdsCondition = (ticketIds: ReadonlyArray<string>): SQL =>
  drizzleSql`${ticketIndex.ticketId} = any(${drizzleSql.param([...ticketIds])}::text[])`

const sectionConditions = (
  section: TicketSection | undefined,
  sectionTicketIds: ReadonlyArray<string> | undefined
): ReadonlyArray<SQL> => [
  ...(section?.status === undefined ? [] : [statusCondition(section.status)]),
  ...(section?.parent === undefined
    ? []
    : [epicSectionCondition(section.parent)]),
  ...(section?.ticketParent === undefined
    ? []
    : [ticketParentSectionCondition(section.ticketParent)]),
  ...(sectionTicketIds === undefined
    ? []
    : [ticketIdsCondition(sectionTicketIds)])
]

interface TicketWhereOptions {
  readonly viewerId: string
  readonly ticketIds?: ReadonlyArray<string>
  readonly excludeTicketIds?: ReadonlyArray<string>
  readonly nestWithin?: NestWithin
}

type NestWithin = (row: SQL) => SQL

const nestKey = (within: NestWithin, row: SQL): SQL =>
  drizzleSql`coalesce((${within(row)})::text, '')`

const pageNestWithin = (
  section: TicketSection | undefined,
  sectionTicketIds: ReadonlyArray<string> | undefined
): NestWithin | undefined => {
  if (section?.status !== undefined) {
    return (row) => columnOf(row, ticketIndex.status)
  }
  if (section?.groupId !== undefined && sectionTicketIds !== undefined) {
    return (row) =>
      drizzleSql`${columnOf(row, ticketIndex.ticketId)} = any(${drizzleSql.param([...sectionTicketIds])}::text[])`
  }
  return undefined
}

const subTicketsInSection = (within: NestWithin | undefined) =>
  within === undefined
    ? drizzleSql<number | null>`null`.as("sub_tickets_in_section")
    : childTicketCount(
        drizzleSql`${nestKey(within, childRow)} = ${nestKey(within, parentRow)}`
      ).as("sub_tickets_in_section")

const ticketWhereConditions = (
  project: TicketProject,
  query: TicketFilter & Pick<TicketListQuery, "q">,
  options: TicketWhereOptions
): ReadonlyArray<SQL> => {
  const filter = query
  const conditions: Array<SQL> = [
    eq(ticketIndex.projectId, project.projectId),
    filter?.archived === true
      ? isNotNull(ticketIndex.archivedAt)
      : isNull(ticketIndex.archivedAt)
  ]
  if (options.ticketIds !== undefined) {
    conditions.push(ticketIdsCondition(options.ticketIds))
  }
  if (options.excludeTicketIds && options.excludeTicketIds.length > 0) {
    conditions.push(
      drizzleSql`${ticketIndex.ticketId} <> all(${drizzleSql.param([
        ...options.excludeTicketIds
      ])}::text[])`
    )
  }
  if (filter?.status !== undefined) {
    conditions.push(statusCondition(filter.status))
  }
  if (filter?.type !== undefined) {
    conditions.push(typeCondition(filter.type))
  }
  if (filter?.excludeType !== undefined && filter.excludeType.length > 0) {
    conditions.push(
      drizzleSql`(${typeCondition(filter.excludeType)}) is not true`
    )
  }
  if (filter?.assignee !== undefined) {
    const assignees = filter.assignee.map((assignee) =>
      assignee === "mine" ? options.viewerId : assignee
    )
    const requestedIds = assignees.filter(
      (assignee) => assignee !== "unassigned"
    )
    const assigneeConditions: Array<SQL> = []
    if (assignees.includes("unassigned")) {
      assigneeConditions.push(
        drizzleSql`cardinality(${ticketIndex.assignees}) = 0`
      )
    }
    if (requestedIds.length > 0) {
      assigneeConditions.push(
        arrayOverlaps(ticketIndex.assignees, requestedIds)
      )
    }
    conditions.push(or(...assigneeConditions) ?? drizzleSql`false`)
  }
  if (filter?.tags !== undefined) {
    conditions.push(
      filter.tags.length === 0
        ? drizzleSql`false`
        : arrayOverlaps(ticketIndex.tags, [...filter.tags])
    )
  }
  if (filter?.hasBranch !== undefined) {
    conditions.push(
      filter.hasBranch
        ? isNotNull(ticketIndex.branch)
        : isNull(ticketIndex.branch)
    )
  }
  if (filter?.hasPr !== undefined) {
    conditions.push(
      filter.hasPr ? isNotNull(ticketIndex.pr) : isNull(ticketIndex.pr)
    )
  }
  if (filter?.parent !== undefined) {
    conditions.push(parentCondition(filter.parent))
  }
  if (filter?.blocked !== undefined) {
    conditions.push(
      filter.blocked
        ? drizzleSql`${openBlockerCountOf(parentRow)} > 0`
        : drizzleSql`${openBlockerCountOf(parentRow)} = 0`
    )
  }
  if (filter?.flagged !== undefined) {
    conditions.push(
      filter.flagged
        ? isNotNull(ticketIndex.flaggedAt)
        : isNull(ticketIndex.flaggedAt)
    )
  }
  if (filter?.subTickets === "nested") {
    const matchingParents = and(
      notEpic,
      ...ticketWhereConditions(
        project,
        { ...query, subTickets: "flat" },
        options
      )
    )
    const within = options.nestWithin
    conditions.push(
      within === undefined
        ? drizzleSql`not (${ticketIndex.parent} is not null and ${ticketIndex.parent} in (
            select ${ticketIndex.ticketId} from ${ticketIndex} where ${matchingParents}
          ))`
        : drizzleSql`not (${ticketIndex.parent} is not null and (${ticketIndex.parent}, ${nestKey(within, parentRow)}) in (
            select ${ticketIndex.ticketId}, ${nestKey(within, parentRow)} from ${ticketIndex} where ${matchingParents}
          ))`
    )
  }
  if (filter?.updatedAfter !== undefined) {
    conditions.push(gt(ticketIndex.updatedAt, filter.updatedAfter))
  }
  if (filter?.estimate !== undefined) {
    conditions.push(
      or(...filter.estimate.map(estimateFilterCondition)) ?? drizzleSql`false`
    )
  }
  const needle = query.q?.trim()
  if (needle) {
    const pattern = escapedLikePattern(needle)
    const search = or(
      ilike(ticketIndex.title, pattern),
      ilike(ticketIndex.ticketId, pattern)
    )
    if (search) conditions.push(search)
  }
  return conditions
}

const TICKET_INDEX_PUBLISH_RETRY_BASE = "50 millis"
const TICKET_INDEX_PUBLISH_RETRY_BUDGET = "1 second"

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const repairs = yield* TicketIndexRepairs.TicketIndexRepairs

  const projectFor = Effect.fn("TicketIndex.projectFor")(function* (
    orgSlug: string,
    slug: string
  ) {
    const rows = yield* db
      .select({
        orgSlug: organization.slug,
        organizationId: projectIndex.organizationId,
        projectId: projectIndex.id,
        slug: projectIndex.slug
      })
      .from(projectIndex)
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .where(
        and(
          eq(organization.slug, orgSlug),
          eq(projectIndex.slug, slug),
          publishedProject()
        )
      )
      .limit(1)
      .pipe(Effect.orDie)
    const row = rows[0]
    return row ?? (yield* new NotFound())
  })

  const toEntry = (row: EntryRow): TicketIndexEntry => ({
    id: makeTicketId(row.ticketId),
    title: row.title,
    status: TicketStatus.make(row.status),
    type: row.type,
    priority: row.priority,
    rank: TicketRank.make(row.rank),
    estimate: estimateFromIndex(row.estimateUnit, row.estimateValue),
    tags: row.tags.map((tag) => makeTagName(tag)),
    branch: row.branch,
    pr: row.pr,
    prState: row.prState,
    prDraft: row.prDraft,
    prBase: row.prBase,
    lastTransitionedPr: row.lastTransitionedPr,
    ignoredBranches: row.ignoredBranches,
    branchDeletedAt: row.branchDeletedAt,
    checks: row.checks,
    checksHeadSha: row.checksHeadSha,
    checksUpdatedAt: row.checksUpdatedAt,
    assignees: row.assignees,
    parent:
      row.parent === null || row.parentTitle === null
        ? null
        : {
            id: makeTicketId(row.parent),
            title: row.parentTitle,
            type: row.parentType
          },
    subTicketCount: row.subTicketCount,
    subTicketDoneCount: row.subTicketDoneCount,
    ...(row.subTicketsInSection === undefined ||
    row.subTicketsInSection === null
      ? {}
      : { subTicketsInSection: row.subTicketsInSection }),
    openBlockerCount: row.openBlockerCount,
    openBlockingCount: row.openBlockingCount,
    relatedCount: row.relatedCount,
    duplicateCount: row.duplicateCount,
    flag: flagFromIndex(row),
    archivedAt: row.archivedAt,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  })

  const list = Effect.fn("TicketIndex.list")(function* (
    project: TicketProject,
    ticketIds?: ReadonlyArray<string>
  ) {
    if (ticketIds !== undefined && ticketIds.length === 0) {
      return []
    }
    const where =
      ticketIds === undefined
        ? eq(ticketIndex.projectId, project.projectId)
        : and(
            eq(ticketIndex.projectId, project.projectId),
            inArray(ticketIndex.ticketId, [...ticketIds])
          )
    return yield* db
      .select(entryColumns)
      .from(ticketIndex)
      .where(where)
      .pipe(
        Effect.map((rows) => rows.map(toEntry)),
        Effect.orDie
      )
  })

  const query = Effect.fn("TicketIndex.query")(function* (
    project: TicketProject,
    ticketQuery: TicketPageQuery,
    options: TicketIndexQueryOptions
  ) {
    if (options.ticketIds?.length === 0) return []
    const expression = ticketSortExpression(ticketQuery.sort)
    const nestWithin = pageNestWithin(
      ticketQuery.section,
      options.sectionTicketIds
    )
    const conditions = [
      ...ticketWhereConditions(project, ticketQuery, {
        ...options,
        nestWithin
      }),
      ...sectionConditions(ticketQuery.section, options.sectionTicketIds),
      ...attachableConditions(options.attachableTo),
      ticketCursorCondition(ticketQuery, expression)
    ].filter((condition) => condition !== undefined)
    return yield* db
      .select({
        ...entryColumns,
        subTicketsInSection: subTicketsInSection(nestWithin),
        sortValue: expression
      })
      .from(ticketIndex)
      .where(and(...conditions))
      .orderBy(
        ...(ticketQuery.sort.dir === "asc"
          ? [asc(expression), asc(ticketIndex.ticketId)]
          : [desc(expression), desc(ticketIndex.ticketId)])
      )
      .limit(Math.max(1, options.limit))
      .pipe(
        Effect.map((rows) =>
          rows.map(({ sortValue, ...row }) => {
            const value = sortValueText(sortValue)
            return {
              entry: toEntry(row),
              sortValue: value,
              orderKey: toOrderKey(value, row.ticketId)
            }
          })
        ),
        Effect.orDie
      )
  })

  const sectionExpression = (
    sections: TicketIndexSectionsOptions["sections"],
    row: SQL = parentRow
  ): SQL => {
    if (sections === "status") return columnOf(row, ticketIndex.status)
    if (sections === "parent") return epicSection
    if (sections === "ticketParent") return ticketParentSection
    const rest = sections.find((section) => section.ticketIds === undefined)
    const branches = sections.flatMap((section) =>
      section.ticketIds === undefined
        ? []
        : [
            drizzleSql`when ${columnOf(row, ticketIndex.ticketId)} = any(${drizzleSql.param(
              [...section.ticketIds]
            )}::text[]) then ${section.key}::text`
          ]
    )
    const fallback =
      rest === undefined ? drizzleSql`null` : drizzleSql`${rest.key}::text`
    return branches.length === 0
      ? fallback
      : drizzleSql`case ${drizzleSql.join(branches, drizzleSql` `)} else ${fallback} end`
  }

  const querySections = Effect.fn("TicketIndex.querySections")(function* (
    project: TicketProject,
    ticketQuery: TicketListQuery,
    options: TicketIndexSectionsOptions
  ) {
    if (options.ticketIds?.length === 0) return new Map()
    const section = sectionExpression(options.sections)
    const sections = options.sections
    const nestWithin: NestWithin | undefined =
      sections === "parent" || sections === "ticketParent"
        ? undefined
        : (row) => sectionExpression(sections, row)
    const whereOptions = { ...options, nestWithin }
    const explicitIds =
      typeof options.sections !== "string" &&
      options.sections.every((entry) => entry.ticketIds !== undefined)
        ? [
            drizzleSql`${ticketIndex.ticketId} = any(${drizzleSql.param(
              options.sections.flatMap((entry) => entry.ticketIds ?? [])
            )}::text[])`
          ]
        : []
    const expression = ticketSortExpression(ticketQuery.sort)
    const ascending = ticketQuery.sort.dir === "asc"
    const ranked = db
      .select({
        ...entryColumns,
        sortValue: drizzleSql<string | Date>`${expression}`.as("sort_value"),
        subTicketsInSection: subTicketsInSection(nestWithin),
        section: drizzleSql<string | null>`${section}`.as("section"),
        position: drizzleSql<number>`row_number() over (
          partition by ${section}
          order by ${expression} ${ascending ? drizzleSql`asc` : drizzleSql`desc`},
            ${ticketIndex.ticketId} ${ascending ? drizzleSql`asc` : drizzleSql`desc`}
        )`
          .mapWith(Number)
          .as("position")
      })
      .from(ticketIndex)
      .where(
        and(
          ...ticketWhereConditions(project, ticketQuery, whereOptions),
          ...explicitIds
        )
      )
      .as("ranked")
    const rows = db
      .select()
      .from(ranked)
      .where(
        and(
          isNotNull(ranked.section),
          lte(ranked.position, Math.max(1, options.limit))
        )
      )
      .orderBy(asc(ranked.section), asc(ranked.position))
    const counts = db
      .select({
        section: drizzleSql<string | null>`${section}`,
        status: ticketIndex.status,
        total: drizzleCount()
      })
      .from(ticketIndex)
      .where(
        and(
          ...ticketWhereConditions(
            project,
            { ...ticketQuery, status: undefined },
            whereOptions
          ),
          ...explicitIds
        )
      )
      .groupBy(drizzleSql`1`, drizzleSql`2`)
    return yield* Effect.all([rows, counts], { concurrency: 2 }).pipe(
      Effect.map(([rows, counts]) => {
        const out = new Map<
          string,
          {
            counts: { total: number; byStatus: Record<string, number> }
            entries: Array<TicketIndexQueryEntry>
          }
        >()
        const at = (key: string) => {
          let current = out.get(key)
          if (current === undefined) {
            current = { counts: { total: 0, byStatus: {} }, entries: [] }
            out.set(key, current)
          }
          return current
        }
        for (const row of counts) {
          if (row.section === null) continue
          const current = at(row.section)
          current.counts.byStatus[row.status] = row.total
          current.counts.total += row.total
        }
        for (const {
          sortValue,
          section: key,
          position: _position,
          ...row
        } of rows) {
          if (key === null) continue
          const value = sortValueText(sortValue)
          at(key).entries.push({
            entry: toEntry(row),
            sortValue: value,
            orderKey: toOrderKey(value, row.ticketId)
          })
        }
        return out
      }),
      Effect.orDie
    )
  })

  const neighbors = Effect.fn("TicketIndex.neighbors")(function* (
    project: TicketProject,
    ticketQuery: TicketListQuery,
    options: TicketIndexNeighborsOptions
  ) {
    const order = options.sections
    const sections = order.kind === "explicit" ? order.sections : order.kind
    const nestWithin: NestWithin | undefined =
      options.within.nestAcrossSections === true ||
      sections === "parent" ||
      sections === "ticketParent"
        ? undefined
        : (row) => sectionExpression(sections, row)
    const ordinal =
      order.kind === "status"
        ? drizzleSql`coalesce((
            select ${projectStatus.orderKey} from ${projectStatus}
            where ${projectStatus.projectId} = ${ticketIndex.projectId}
              and ${projectStatus.slug} = ${ticketIndex.status}
          ), '') collate "C"`
        : drizzleSql`array_position(${drizzleSql.param(
            order.kind === "explicit"
              ? order.sections.map((section) => section.key)
              : [...order.keys]
          )}::text[], ${sectionExpression(sections)})`
    const { sort } = options.within
    const dir = sort.dir === "asc" ? drizzleSql`asc` : drizzleSql`desc`
    const withinExpression = ticketSortExpression(sort)
    const window = drizzleSql`order by ${ordinal} asc, ${withinExpression} ${dir}, ${ticketIndex.ticketId} ${dir}`
    const ordered = db
      .select({
        ticketId: ticketIndex.ticketId,
        prevId: drizzleSql<
          string | null
        >`lag(${ticketIndex.ticketId}) over (${window})`.as("prev_id"),
        prevTitle: drizzleSql<
          string | null
        >`lag(${ticketIndex.title}) over (${window})`.as("prev_title"),
        nextId: drizzleSql<
          string | null
        >`lead(${ticketIndex.ticketId}) over (${window})`.as("next_id"),
        nextTitle: drizzleSql<
          string | null
        >`lead(${ticketIndex.title}) over (${window})`.as("next_title"),
        position: drizzleSql<number>`row_number() over (${window})`
          .mapWith(Number)
          .as("position"),
        total: drizzleSql<number>`count(*) over ()`.mapWith(Number).as("total")
      })
      .from(ticketIndex)
      .where(
        and(
          ...ticketWhereConditions(project, ticketQuery, {
            ...options,
            nestWithin
          }),
          drizzleSql`${ordinal} is not null`
        )
      )
      .as("ordered")
    return yield* db
      .select()
      .from(ordered)
      .where(eq(ordered.ticketId, options.ticketId))
      .limit(1)
      .pipe(
        Effect.map((rows): TicketNeighbors | null => {
          const row = rows[0]
          return row === undefined
            ? null
            : {
                prev: neighborOf(row.prevId, row.prevTitle),
                next: neighborOf(row.nextId, row.nextTitle),
                position: row.position,
                total: row.total
              }
        }),
        Effect.orDie
      )
  })

  const projectsFor = Effect.fn("TicketIndex.projectsFor")(function* (
    orgSlug: string,
    slugs: ReadonlyArray<string>
  ) {
    if (slugs.length === 0) return []
    return yield* db
      .select({
        orgSlug: organization.slug,
        organizationId: projectIndex.organizationId,
        projectId: projectIndex.id,
        slug: projectIndex.slug
      })
      .from(projectIndex)
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .where(
        and(
          eq(organization.slug, orgSlug),
          inArray(projectIndex.slug, [...slugs])
        )
      )
      .pipe(Effect.orDie)
  })

  const acrossProjects = (
    projects: ReadonlyArray<TicketProject>,
    conditions: ReadonlyArray<SQL | undefined>
  ) =>
    and(
      inArray(
        ticketIndex.projectId,
        projects.map((p) => p.projectId)
      ),
      isNull(ticketIndex.archivedAt),
      ...conditions
    )

  const orgEntriesOf = <Row extends EntryRow>(
    projects: ReadonlyArray<TicketProject>,
    rows: ReadonlyArray<Row>
  ): ReadonlyArray<TicketIndexOrgEntry & Readonly<{ row: Row }>> => {
    const byId = new Map(projects.map((p) => [p.projectId, p]))
    return rows.flatMap((row) => {
      const project = byId.get(row.projectId)
      if (!project) return []
      return [
        {
          project,
          entry: toEntry(row),
          sortValue: row.updatedAt.toISOString(),
          row
        }
      ]
    })
  }

  const queryAcross = (
    projects: ReadonlyArray<TicketProject>,
    conditions: ReadonlyArray<SQL | undefined>,
    limit: number
  ): Effect.Effect<ReadonlyArray<TicketIndexOrgEntry>> => {
    if (projects.length === 0) return Effect.succeed([])
    return db
      .select(entryColumns)
      .from(ticketIndex)
      .where(acrossProjects(projects, conditions))
      .orderBy(desc(ticketIndex.updatedAt), desc(ticketIndex.ticketId))
      .limit(Math.max(1, limit))
      .pipe(
        Effect.map((rows) =>
          orgEntriesOf(projects, rows).map(({ row: _row, ...entry }) => entry)
        ),
        Effect.orDie
      )
  }

  const finishedTicket = finishedStatus(parentRow)

  const assignedConditions = (scope: TicketIndexAssignedScope) => [
    arrayContains(ticketIndex.assignees, [scope.viewerId]),
    or(
      drizzleSql`not ${finishedTicket}`,
      gt(ticketIndex.updatedAt, scope.doneAfter)
    )
  ]

  const countAssignedByStatus = Effect.fn("TicketIndex.countAssignedByStatus")(
    function* (
      projects: ReadonlyArray<TicketProject>,
      scope: TicketIndexAssignedScope
    ) {
      if (projects.length === 0) return []
      const byId = new Map(projects.map((p) => [p.projectId, p]))
      return yield* db
        .select({
          projectId: ticketIndex.projectId,
          status: ticketIndex.status,
          count: drizzleCount()
        })
        .from(ticketIndex)
        .where(acrossProjects(projects, assignedConditions(scope)))
        .groupBy(ticketIndex.projectId, ticketIndex.status)
        .pipe(
          Effect.map((rows) =>
            rows.flatMap((row) => {
              const project = byId.get(row.projectId)
              if (!project) return []
              return [
                {
                  project,
                  status: TicketStatus.make(row.status),
                  count: row.count
                }
              ]
            })
          ),
          Effect.orDie
        )
    }
  )

  const assignedPerProject = Effect.fn("TicketIndex.assignedPerProject")(
    function* (
      projects: ReadonlyArray<TicketProject>,
      scope: TicketIndexAssignedScope & Readonly<{ perProject: number }>
    ) {
      if (projects.length === 0) return []
      const ranked = db
        .select({
          ...entryColumns,
          position: drizzleSql<number>`row_number() over (
          partition by ${ticketIndex.projectId}
          order by ${ticketIndex.updatedAt} desc, ${ticketIndex.ticketId} desc
        )`
            .mapWith(Number)
            .as("position"),
          total: drizzleSql<number>`count(*) over (
          partition by ${ticketIndex.projectId}
        )`
            .mapWith(Number)
            .as("total")
        })
        .from(ticketIndex)
        .where(acrossProjects(projects, assignedConditions(scope)))
        .as("ranked")
      return yield* db
        .select()
        .from(ranked)
        .where(lte(ranked.position, Math.max(1, scope.perProject)))
        .orderBy(asc(ranked.projectId), asc(ranked.position))
        .pipe(
          Effect.map((rows) => {
            const byProject = new Map<string, TicketIndexProjectPreview>()
            for (const { position: _position, total, ...row } of rows) {
              const project = projects.find(
                (candidate) => candidate.projectId === row.projectId
              )
              if (!project) continue
              const current = byProject.get(row.projectId)
              byProject.set(row.projectId, {
                project,
                total,
                entries: [...(current?.entries ?? []), toEntry(row)]
              })
            }
            return [...byProject.values()]
          }),
          Effect.orDie
        )
    }
  )

  const assignedTo = Effect.fn("TicketIndex.assignedTo")(function* (
    projects: ReadonlyArray<TicketProject>,
    options: TicketIndexAssignedOptions
  ) {
    return yield* queryAcross(
      projects,
      [
        ...assignedConditions(options),
        ticketCursorCondition(
          { sort: UPDATED_DESC, cursor: options.cursor },
          ticketSortExpression(UPDATED_DESC)
        )
      ],
      options.limit
    )
  })

  const touchedBy = Effect.fn("TicketIndex.touchedBy")(function* (
    projects: ReadonlyArray<TicketProject>,
    options: TicketIndexTouchedOptions
  ) {
    if (projects.length === 0) return []
    const viewerComments = and(
      eq(commentIndex.authorId, options.viewerId),
      eq(commentIndex.projectId, ticketIndex.projectId),
      eq(commentIndex.ticketId, ticketIndex.ticketId)
    )
    const lastCommentAt = drizzleSql<Date | null>`(
      select max(${commentIndex.createdAt})
      from ${commentIndex}
      where ${viewerComments}
    )`
    const viewerAssigned = arrayContains(ticketIndex.assignees, [
      options.viewerId
    ])
    const viewerCreated = eq(ticketIndex.createdBy, options.viewerId)
    const activityKind = drizzleSql<string>`${ticketActivity.change}->>'kind'`
    const latestEvent = (alias: string, conditions: ReadonlyArray<SQL>) =>
      db
        .select({
          occurredAt: ticketActivity.occurredAt,
          actorKind: ticketActivity.actorKind,
          actorUserId: ticketActivity.actorUserId,
          actorClientId: ticketActivity.actorClientId,
          actorClientName: ticketActivity.actorClientName,
          actorSource: ticketActivity.actorSource,
          change: ticketActivity.change
        })
        .from(ticketActivity)
        .where(
          and(
            eq(ticketActivity.projectId, ticketIndex.projectId),
            eq(ticketActivity.ticketId, ticketIndex.ticketId),
            ...conditions
          )
        )
        .orderBy(desc(ticketActivity.occurredAt), desc(ticketActivity.seq))
        .limit(1)
        .as(alias)
    const assignedEvent = latestEvent("assigned_event", [
      viewerAssigned,
      eq(activityKind, "assignees_changed"),
      drizzleSql`${ticketActivity.change} @> jsonb_build_object(
        'added', jsonb_build_array(${options.viewerId}::text)
      )`
    ])
    const gitVisible =
      options.gitProjectIds.length === 0
        ? drizzleSql`false`
        : inArray(ticketIndex.projectId, [...options.gitProjectIds])
    const statusEvent = latestEvent("status_event", [
      or(viewerAssigned, viewerCreated) ?? drizzleSql`false`,
      eq(activityKind, "status_changed"),
      or(
        drizzleSql`${ticketActivity.cause} is distinct from 'git_automation'`,
        gitVisible
      ) ?? drizzleSql`true`
    ])
    const activityAt = drizzleSql`greatest(
      case when ${viewerCreated} then ${ticketIndex.createdAt} end,
      ${lastCommentAt},
      ${assignedEvent.occurredAt},
      ${statusEvent.occurredAt}
    )`
    return yield* db
      .select({
        ...entryColumns,
        lastCommentAt: lastCommentAt.mapWith(commentIndex.createdAt),
        assignedEvent: { ...assignedEvent._.selectedFields },
        statusEvent: { ...statusEvent._.selectedFields }
      })
      .from(ticketIndex)
      .leftJoinLateral(assignedEvent, drizzleSql`true`)
      .leftJoinLateral(statusEvent, drizzleSql`true`)
      .where(
        acrossProjects(projects, [
          or(
            viewerCreated,
            viewerAssigned,
            exists(
              db
                .select({ id: commentIndex.id })
                .from(commentIndex)
                .where(viewerComments)
            )
          )
        ])
      )
      .orderBy(
        drizzleSql`${activityAt} desc nulls last`,
        desc(ticketIndex.updatedAt),
        desc(ticketIndex.ticketId)
      )
      .limit(Math.max(1, options.limit))
      .pipe(
        Effect.map((rows) =>
          orgEntriesOf(projects, rows).map(({ row, ...entry }) => ({
            ...entry,
            lastCommentAt: row.lastCommentAt,
            assignedEvent: touchedEventOf(row.assignedEvent),
            statusEvent: touchedEventOf(row.statusEvent)
          }))
        ),
        Effect.orDie
      )
  })

  const rankCollated = drizzleSql`${ticketIndex.rank} collate "C"`

  const topRank = Effect.fn("TicketIndex.topRank")(function* (
    project: TicketProject
  ) {
    const rows = yield* db
      .select({ rank: ticketIndex.rank })
      .from(ticketIndex)
      .where(eq(ticketIndex.projectId, project.projectId))
      .orderBy(asc(rankCollated))
      .limit(1)
      .pipe(Effect.orDie)
    const rank = rows[0]?.rank
    return rank === undefined ? null : TicketRank.make(rank)
  })

  const rankGap = Effect.fn("TicketIndex.rankGap")(function* (
    project: TicketProject,
    anchorId: string,
    side: "after" | "before",
    excludeId: string
  ) {
    const anchor = (yield* db
      .select({ rank: ticketIndex.rank })
      .from(ticketIndex)
      .where(
        and(
          eq(ticketIndex.projectId, project.projectId),
          eq(ticketIndex.ticketId, anchorId)
        )
      )
      .limit(1)
      .pipe(Effect.orDie))[0]
    if (anchor === undefined) return null
    const neighbor = (yield* db
      .select({ rank: ticketIndex.rank })
      .from(ticketIndex)
      .where(
        and(
          eq(ticketIndex.projectId, project.projectId),
          ne(ticketIndex.ticketId, excludeId),
          side === "after"
            ? drizzleSql`${rankCollated} > ${anchor.rank} collate "C"`
            : drizzleSql`${rankCollated} < ${anchor.rank} collate "C"`
        )
      )
      .orderBy(side === "after" ? asc(rankCollated) : desc(rankCollated))
      .limit(1)
      .pipe(Effect.orDie))[0]
    const anchorRank = TicketRank.make(anchor.rank)
    const neighborRank =
      neighbor === undefined ? null : TicketRank.make(neighbor.rank)
    return side === "after"
      ? { lower: anchorRank, upper: neighborRank }
      : { lower: neighborRank, upper: anchorRank }
  })

  const orderKeyFor = Effect.fn("TicketIndex.orderKeyFor")(function* (
    project: TicketProject,
    ticketId: string,
    sort: TicketSort
  ) {
    return yield* db
      .select({ sortValue: ticketSortExpression(sort) })
      .from(ticketIndex)
      .where(
        and(
          eq(ticketIndex.projectId, project.projectId),
          eq(ticketIndex.ticketId, ticketId)
        )
      )
      .limit(1)
      .pipe(
        Effect.map((rows) => {
          const row = rows[0]
          return row === undefined
            ? null
            : toOrderKey(sortValueText(row.sortValue), ticketId)
        }),
        Effect.orDie
      )
  })

  const count = Effect.fn("TicketIndex.count")(function* (
    project: TicketProject,
    ticketQuery: TicketCountQuery,
    options: TicketIndexCountOptions
  ) {
    if (options.ticketIds?.length === 0) {
      return { total: 0, byStatus: {} }
    }
    return yield* db
      .select({
        status: ticketIndex.status,
        total: drizzleCount()
      })
      .from(ticketIndex)
      .where(and(...ticketWhereConditions(project, ticketQuery, options)))
      .groupBy(ticketIndex.status)
      .pipe(
        Effect.map((rows) => {
          const byStatus: Record<string, number> = {}
          let total = 0
          for (const row of rows) {
            byStatus[row.status] = row.total
            total += row.total
          }
          return { total, byStatus }
        }),
        Effect.orDie
      )
  })

  const listIds = Effect.fn("TicketIndex.listIds")(function* (
    project: TicketProject
  ) {
    return yield* db
      .select({ ticketId: ticketIndex.ticketId })
      .from(ticketIndex)
      .where(eq(ticketIndex.projectId, project.projectId))
      .pipe(
        Effect.map((rows) => rows.map((row) => row.ticketId)),
        Effect.orDie
      )
  })

  const existingIds = Effect.fn("TicketIndex.existingIds")(function* (
    project: TicketProject,
    ticketIds: ReadonlyArray<string>
  ) {
    if (ticketIds.length === 0) return new Set<string>()
    return yield* db
      .select({ ticketId: ticketIndex.ticketId })
      .from(ticketIndex)
      .where(
        and(
          eq(ticketIndex.projectId, project.projectId),
          inArray(ticketIndex.ticketId, [...ticketIds])
        )
      )
      .pipe(
        Effect.map((rows) => new Set(rows.map((row) => row.ticketId))),
        Effect.orDie
      )
  })

  const mentionableIds = Effect.fn("TicketIndex.mentionableIds")(function* (
    project: TicketProject,
    mentionIds: ReadonlyArray<string>
  ) {
    if (mentionIds.length === 0) return new Set<string>()
    const targets = mentionIds.map((mentionId) => {
      const target = parseTicketMentionId(mentionId)
      return {
        mentionId,
        projectSlug: target.projectSlug ?? project.slug,
        ticketId: target.ticketId
      }
    })
    const keyOf = (target: (typeof targets)[number]) =>
      formatMovedFrom(target.projectSlug, target.ticketId)
    const keys = [...new Set(targets.map(keyOf))]
    const slugs = [...new Set(targets.map((target) => target.projectSlug))]
    const projectRows = yield* db
      .select({ id: projectIndex.id, slug: projectIndex.slug })
      .from(projectIndex)
      .where(
        and(
          eq(projectIndex.organizationId, project.organizationId),
          inArray(projectIndex.slug, slugs)
        )
      )
      .pipe(Effect.orDie)
    const slugById = new Map(projectRows.map((row) => [row.id, row.slug]))
    const inProjects = projectRows.map((row) =>
      and(
        eq(ticketIndex.projectId, row.id),
        inArray(
          ticketIndex.ticketId,
          targets
            .filter((target) => target.projectSlug === row.slug)
            .map((target) => target.ticketId)
        )
      )
    )
    const rows = yield* db
      .select({
        projectId: ticketIndex.projectId,
        ticketId: ticketIndex.ticketId,
        movedFrom: ticketIndex.movedFrom
      })
      .from(ticketIndex)
      .where(
        and(
          eq(ticketIndex.organizationId, project.organizationId),
          or(...inProjects, arrayOverlaps(ticketIndex.movedFrom, keys))
        )
      )
      .pipe(Effect.orDie)
    const known = new Set(
      rows.flatMap((row) => {
        const slug = slugById.get(row.projectId)
        return [
          ...(slug === undefined ? [] : [formatMovedFrom(slug, row.ticketId)]),
          ...row.movedFrom
        ]
      })
    )
    return new Set(
      targets
        .filter((target) => known.has(keyOf(target)))
        .map((target) => target.mentionId)
    )
  })

  const movedTo = Effect.fn("TicketIndex.movedTo")(function* (
    project: TicketProject,
    ticketId: string
  ) {
    const rows = yield* db
      .select({
        projectSlug: projectIndex.slug,
        ticketId: ticketIndex.ticketId
      })
      .from(ticketIndex)
      .innerJoin(projectIndex, eq(projectIndex.id, ticketIndex.projectId))
      .where(
        and(
          eq(ticketIndex.organizationId, project.organizationId),
          arrayContains(ticketIndex.movedFrom, [
            formatMovedFrom(project.slug, ticketId)
          ]),
          publishedProject()
        )
      )
      .limit(1)
      .pipe(Effect.orDie)
    return rows[0] ?? null
  })

  const reserveTicketNumber = Effect.fn("TicketIndex.reserveTicketNumber")(
    function* (project: TicketProject) {
      return yield* db
        .update(projectIndex)
        .set({
          nextTicketNumber: drizzleSql`${projectIndex.nextTicketNumber} + 1`
        })
        .where(eq(projectIndex.id, project.projectId))
        .returning({ value: projectIndex.nextTicketNumber })
        .pipe(
          Effect.flatMap((rows) => {
            const value = rows[0]?.value
            if (value === undefined) {
              return Effect.die(
                new Error(`project not found: ${project.projectId}`)
              )
            }
            return Effect.succeed(value - 1)
          }),
          Effect.orDie
        )
    }
  )

  const tagUsageCounts = Effect.fn("TicketIndex.tagUsageCounts")(function* (
    project: TicketProject
  ) {
    return yield* db
      .select({ tags: ticketIndex.tags })
      .from(ticketIndex)
      .where(eq(ticketIndex.projectId, project.projectId))
      .pipe(
        Effect.map((rows) => {
          const counts: Record<string, number> = {}
          for (const row of rows) {
            for (const tag of row.tags) counts[tag] = (counts[tag] ?? 0) + 1
          }
          return counts
        }),
        Effect.orDie
      )
  })

  const findTicketIdsByTag = Effect.fn("TicketIndex.findTicketIdsByTag")(
    function* (project: TicketProject, tag: string) {
      return yield* db
        .select({ ticketId: ticketIndex.ticketId, tags: ticketIndex.tags })
        .from(ticketIndex)
        .where(eq(ticketIndex.projectId, project.projectId))
        .pipe(
          Effect.map((rows) =>
            rows
              .filter((row) => row.tags.includes(tag))
              .map((row) => row.ticketId)
          ),
          Effect.orDie
        )
    }
  )

  const findTicketIdsByStatus = Effect.fn("TicketIndex.findTicketIdsByStatus")(
    function* (project: TicketProject, status: string) {
      return yield* db
        .select({ ticketId: ticketIndex.ticketId })
        .from(ticketIndex)
        .where(
          and(
            eq(ticketIndex.projectId, project.projectId),
            eq(ticketIndex.status, status)
          )
        )
        .pipe(
          Effect.map((rows) => rows.map((r) => r.ticketId)),
          Effect.orDie
        )
    }
  )

  const syncTicketBranches = (
    project: TicketProject,
    document: TicketDocs.TicketDocument
  ) =>
    Effect.gen(function* () {
      const rows = ticketBranchRowsFor(project, document)
      const ticket = and(
        eq(ticketBranch.projectId, project.projectId),
        eq(ticketBranch.ticketId, document.id)
      )
      yield* db.delete(ticketBranch).where(
        rows.length === 0
          ? ticket
          : and(
              ticket,
              notInArray(
                ticketBranch.branch,
                rows.map((row) => row.branch)
              )
            )
      )
      if (rows.length === 0) return
      yield* db
        .insert(ticketBranch)
        .values([...rows])
        .onConflictDoUpdate({
          target: [
            ticketBranch.projectId,
            ticketBranch.ticketId,
            ticketBranch.branch
          ],
          set: {
            position: drizzleSql`excluded.position`,
            base: drizzleSql`excluded.base`,
            pr: drizzleSql`excluded.pr`,
            prState: drizzleSql`excluded.pr_state`,
            prDraft: drizzleSql`excluded.pr_draft`,
            landed: drizzleSql`excluded.landed`
          }
        })
    })

  const syncTicketRelations = (
    project: TicketProject,
    document: TicketDocs.TicketDocument
  ) =>
    Effect.gen(function* () {
      yield* db
        .delete(ticketRelationIndex)
        .where(
          and(
            eq(ticketRelationIndex.projectId, project.projectId),
            eq(ticketRelationIndex.fromTicketId, document.id)
          )
        )
      const rows = ticketRelationRowsFor(project, document)
      if (rows.length === 0) return
      yield* db.insert(ticketRelationIndex).values([...rows])
    })

  const upsertTicket = Effect.fn("TicketIndex.upsertTicket")(function* (
    project: TicketProject,
    document: TicketDocs.TicketDocument
  ) {
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          yield* db
            .insert(ticketIndex)
            .values(ticketIndexRowFor(project, document))
            .onConflictDoUpdate({
              target: [ticketIndex.projectId, ticketIndex.ticketId],
              set: ticketIndexRowFor(project, document)
            })
          yield* syncTicketBranches(project, document)
          yield* syncTicketRelations(project, document)
        })
      )
      .pipe(
        Effect.asVoid,
        Effect.retry({
          schedule: Schedule.exponential(TICKET_INDEX_PUBLISH_RETRY_BASE).pipe(
            Schedule.upTo({ duration: TICKET_INDEX_PUBLISH_RETRY_BUDGET })
          )
        }),
        Effect.catchCause((cause) =>
          Effect.logError(
            "ticket index publication failed; queued for reconcile",
            cause
          ).pipe(
            Effect.annotateLogs({
              module: "TicketIndex",
              orgSlug: project.orgSlug,
              slug: project.slug,
              projectId: project.projectId,
              ticketId: document.id
            }),
            Effect.andThen(repairs.markUnpublished(project))
          )
        )
      )
  })

  const deleteTicket = Effect.fn("TicketIndex.deleteTicket")(function* (
    project: TicketProject,
    ticketId: string
  ) {
    return yield* db
      .delete(ticketIndex)
      .where(
        and(
          eq(ticketIndex.projectId, project.projectId),
          eq(ticketIndex.ticketId, ticketId)
        )
      )
      .pipe(Effect.asVoid, Effect.orDie)
  })

  const parentOf = Effect.fn("TicketIndex.parentOf")(function* (
    project: TicketProject,
    ticketId: string
  ) {
    const [row] = yield* db
      .select({
        id: ticketIndex.ticketId,
        title: ticketIndex.title,
        type: ticketIndex.type
      })
      .from(ticketIndex)
      .where(
        and(
          eq(ticketIndex.projectId, project.projectId),
          eq(ticketIndex.ticketId, ticketId)
        )
      )
      .pipe(Effect.orDie)
    return row ? { ...row, id: makeTicketId(row.id) } : null
  })

  const relationsOf = Effect.fn("TicketIndex.relationsOf")(function* (
    project: TicketProject,
    ticketId: string
  ) {
    const other = alias(ticketIndex, "other_ticket")
    const rows = yield* db
      .select({
        from: ticketRelationIndex.fromTicketId,
        kind: ticketRelationIndex.kind,
        ticketId: other.ticketId,
        title: other.title,
        status: other.status,
        archivedAt: other.archivedAt
      })
      .from(ticketRelationIndex)
      .innerJoin(
        other,
        and(
          eq(other.projectId, ticketRelationIndex.projectId),
          eq(
            other.ticketId,
            drizzleSql`case when ${ticketRelationIndex.fromTicketId} = ${ticketId} then ${ticketRelationIndex.toTicketId} else ${ticketRelationIndex.fromTicketId} end`
          )
        )
      )
      .where(
        and(
          eq(ticketRelationIndex.projectId, project.projectId),
          or(
            eq(ticketRelationIndex.fromTicketId, ticketId),
            eq(ticketRelationIndex.toTicketId, ticketId)
          )
        )
      )
      .pipe(Effect.orDie)
    return relationsFromRows(
      rows.map(
        (row): RelationRow => ({
          direction: row.from === ticketId ? "out" : "in",
          kind: row.kind,
          other: {
            id: makeTicketId(row.ticketId),
            title: row.title,
            status: TicketStatus.make(row.status),
            archivedAt: row.archivedAt
          }
        })
      )
    )
  })

  const relationEdges = Effect.fn("TicketIndex.relationEdges")(function* (
    project: TicketProject
  ) {
    const rows = yield* db
      .select({
        from: ticketRelationIndex.fromTicketId,
        to: ticketRelationIndex.toTicketId,
        kind: ticketRelationIndex.kind
      })
      .from(ticketRelationIndex)
      .where(eq(ticketRelationIndex.projectId, project.projectId))
      .pipe(Effect.orDie)
    return rows.map(
      (row): RelationEdge => ({
        from: makeTicketId(row.from),
        to: makeTicketId(row.to),
        kind: row.kind
      })
    )
  })

  return TicketIndex.of({
    parentOf,
    relationsOf,
    relationEdges,
    projectFor,
    projectsFor,
    assignedTo,
    countAssignedByStatus,
    assignedPerProject,
    touchedBy,
    list,
    query,
    querySections,
    neighbors,
    orderKeyFor,
    topRank,
    rankGap,
    count,
    listIds,
    existingIds,
    mentionableIds,
    movedTo,
    reserveTicketNumber,
    tagUsageCounts,
    findTicketIdsByTag,
    findTicketIdsByStatus,
    upsertTicket,
    deleteTicket
  })
})

export const layer = Layer.effect(TicketIndex, make)
