import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  commentIndex,
  organization,
  projectIndex,
  projectStatus,
  ticketBranch,
  ticketIndex
} from "@pp/db/schema"
import {
  ESTIMATE_SIZES,
  EPIC_SECTION_NONE,
  Estimate,
  estimateRank,
  NotFound,
  TagName,
  TicketId,
  tryDecodeCursor,
  type EstimateFilterValue,
  type TicketCountQuery,
  type TicketFilter,
  type TicketListQuery,
  type TicketPageQuery,
  type TicketSection,
  type TicketSort,
  type ParentFilter,
  TicketStatus
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
import type { AnyPgColumn } from "drizzle-orm/pg-core"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Schedule from "effect/Schedule"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"

import type { TicketDocument } from "./TicketDocs"
import {
  TicketIndex,
  type TicketIndexEntry,
  type TicketIndexCountOptions,
  type TicketIndexAssignedOptions,
  type TicketIndexAssignedScope,
  type TicketIndexCounts,
  type TicketIndexOrgEntry,
  type TicketIndexProject,
  type TicketIndexProjectPreview,
  type TicketIndexQueryEntry,
  type TicketIndexAttachable,
  type TicketIndexQueryOptions,
  type TicketIndexSections,
  type TicketIndexSectionsOptions,
  type TicketIndexTouchedEntry,
  type TicketIndexTouchedOptions
} from "./TicketIndex"
import * as TicketIndexRepairs from "./TicketIndexRepairs"

const makeTicketId = Schema.decodeUnknownSync(TicketId)
const makeTagName = Schema.decodeUnknownSync(TagName)
const decodeEstimate = Schema.decodeUnknownOption(Estimate)

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
  project: TicketIndexProject,
  document: TicketDocument
): typeof ticketIndex.$inferInsert => ({
  organizationId: project.organizationId,
  projectId: project.projectId,
  ticketId: document.id,
  title: document.title,
  status: document.status,
  type: document.type,
  priority: document.priority,
  estimateUnit: document.estimate?.unit ?? null,
  estimateValue: document.estimate ? estimateRank(document.estimate) : null,
  tags: [...document.tags],
  assignees: [...document.assignees],
  parent: document.parent ?? null,
  branch: document.branch,
  pr: document.pr,
  prState: document.prState,
  prDraft: document.prDraft ?? false,
  prBase: document.prBase ?? null,
  lastTransitionedPr: document.lastTransitionedPr,
  ignoredBranches: [...(document.ignoredBranches ?? [])],
  archivedAt: document.archivedAt,
  createdBy: document.createdBy,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt
})

export const ticketBranchRowsFor = (
  project: TicketIndexProject,
  document: TicketDocument
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

const childTicketCount = (condition: SQL) =>
  drizzleSql<number>`(
  select count(*) from ${ticketIndex} as ${childRow}
  where ${isChildRow}
    and ${columnOf(childRow, ticketIndex.archivedAt)} is null
    and ${condition}
)`.mapWith(Number)

const entryColumns = {
  ...getTableColumns(ticketIndex),
  subTicketCount: childTicketCount(drizzleSql`true`).as("sub_ticket_count"),
  subTicketDoneCount: childTicketCount(finishedStatus(childRow)).as(
    "sub_ticket_done_count"
  )
}

type EntryRow = typeof ticketIndex.$inferSelect &
  Readonly<{ subTicketCount: number; subTicketDoneCount: number }>

const attachableConditions = (
  attachable: TicketIndexAttachable | undefined
): ReadonlyArray<SQL> =>
  attachable === undefined
    ? []
    : [
        ne(ticketIndex.type, "epic"),
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
  ...(section?.parent === undefined ? [] : [parentCondition(section.parent)]),
  ...(sectionTicketIds === undefined
    ? []
    : [ticketIdsCondition(sectionTicketIds)])
]

interface TicketWhereOptions {
  readonly viewerId: string
  readonly ticketIds?: ReadonlyArray<string>
  readonly excludeTicketIds?: ReadonlyArray<string>
}

const ticketWhereConditions = (
  project: TicketIndexProject,
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
    conditions.push(
      filter.type.length === 0
        ? drizzleSql`false`
        : inArray(ticketIndex.type, [...filter.type])
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
  if (filter?.subTickets === "nested") {
    const matchingParents = and(
      ne(ticketIndex.type, "epic"),
      ...ticketWhereConditions(
        project,
        { ...query, subTickets: "flat" },
        options
      )
    )
    conditions.push(
      drizzleSql`not (${ticketIndex.parent} is not null and ${ticketIndex.parent} in (
        select ${ticketIndex.ticketId} from ${ticketIndex} where ${matchingParents}
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

export const TicketIndexLive = Layer.effect(
  TicketIndex,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    const repairs = yield* TicketIndexRepairs.TicketIndexRepairs

    const projectFor = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<TicketIndexProject, NotFound> =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({
            orgSlug: organization.slug,
            organizationId: projectIndex.organizationId,
            projectId: projectIndex.id,
            projectSlug: projectIndex.slug
          })
          .from(projectIndex)
          .innerJoin(
            organization,
            eq(organization.id, projectIndex.organizationId)
          )
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
      parent: row.parent === null ? null : makeTicketId(row.parent),
      subTicketCount: row.subTicketCount,
      subTicketDoneCount: row.subTicketDoneCount,
      archivedAt: row.archivedAt,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })

    const list = (
      project: TicketIndexProject,
      ticketIds?: ReadonlyArray<string>
    ): Effect.Effect<ReadonlyArray<TicketIndexEntry>> => {
      if (ticketIds !== undefined && ticketIds.length === 0) {
        return Effect.succeed([])
      }
      const where =
        ticketIds === undefined
          ? eq(ticketIndex.projectId, project.projectId)
          : and(
              eq(ticketIndex.projectId, project.projectId),
              inArray(ticketIndex.ticketId, [...ticketIds])
            )
      return db
        .select(entryColumns)
        .from(ticketIndex)
        .where(where)
        .pipe(
          Effect.map((rows) => rows.map(toEntry)),
          Effect.orDie
        )
    }

    const query = (
      project: TicketIndexProject,
      ticketQuery: TicketPageQuery,
      options: TicketIndexQueryOptions
    ): Effect.Effect<ReadonlyArray<TicketIndexQueryEntry>> => {
      if (options.ticketIds?.length === 0) return Effect.succeed([])
      const expression = ticketSortExpression(ticketQuery.sort)
      const conditions = [
        ...ticketWhereConditions(project, ticketQuery, options),
        ...sectionConditions(ticketQuery.section, options.sectionTicketIds),
        ...attachableConditions(options.attachableTo),
        ticketCursorCondition(ticketQuery, expression)
      ].filter((condition) => condition !== undefined)
      return db
        .select({
          ...entryColumns,
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
    }

    const sectionExpression = (
      sections: TicketIndexSectionsOptions["sections"]
    ): SQL => {
      if (sections === "status") return drizzleSql`${ticketIndex.status}`
      if (sections === "parent") {
        return drizzleSql`coalesce(${ticketIndex.parent}, ${EPIC_SECTION_NONE}::text)`
      }
      const rest = sections.find((section) => section.ticketIds === undefined)
      const branches = sections.flatMap((section) =>
        section.ticketIds === undefined
          ? []
          : [
              drizzleSql`when ${ticketIndex.ticketId} = any(${drizzleSql.param([
                ...section.ticketIds
              ])}::text[]) then ${section.key}::text`
            ]
      )
      const fallback =
        rest === undefined ? drizzleSql`null` : drizzleSql`${rest.key}::text`
      return branches.length === 0
        ? fallback
        : drizzleSql`case ${drizzleSql.join(branches, drizzleSql` `)} else ${fallback} end`
    }

    const querySections = (
      project: TicketIndexProject,
      ticketQuery: TicketListQuery,
      options: TicketIndexSectionsOptions
    ): Effect.Effect<TicketIndexSections> => {
      if (options.ticketIds?.length === 0) return Effect.succeed(new Map())
      const section = sectionExpression(options.sections)
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
          section: drizzleSql<string | null>`${section}`.as("section"),
          rank: drizzleSql<number>`row_number() over (
            partition by ${section}
            order by ${expression} ${ascending ? drizzleSql`asc` : drizzleSql`desc`},
              ${ticketIndex.ticketId} ${ascending ? drizzleSql`asc` : drizzleSql`desc`}
          )`
            .mapWith(Number)
            .as("rank")
        })
        .from(ticketIndex)
        .where(
          and(
            ...ticketWhereConditions(project, ticketQuery, options),
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
            lte(ranked.rank, Math.max(1, options.limit))
          )
        )
        .orderBy(asc(ranked.section), asc(ranked.rank))
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
              options
            ),
            ...explicitIds
          )
        )
        .groupBy(drizzleSql`1`, drizzleSql`2`)
      return Effect.all([rows, counts], { concurrency: 2 }).pipe(
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
          for (const { sortValue, section: key, rank: _rank, ...row } of rows) {
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
    }

    const projectsFor = (
      orgSlug: string,
      slugs: ReadonlyArray<string>
    ): Effect.Effect<ReadonlyArray<TicketIndexProject>> => {
      if (slugs.length === 0) return Effect.succeed([])
      return db
        .select({
          orgSlug: organization.slug,
          organizationId: projectIndex.organizationId,
          projectId: projectIndex.id,
          projectSlug: projectIndex.slug
        })
        .from(projectIndex)
        .innerJoin(
          organization,
          eq(organization.id, projectIndex.organizationId)
        )
        .where(
          and(
            eq(organization.slug, orgSlug),
            inArray(projectIndex.slug, [...slugs])
          )
        )
        .pipe(Effect.orDie)
    }

    const acrossProjects = (
      projects: ReadonlyArray<TicketIndexProject>,
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
      projects: ReadonlyArray<TicketIndexProject>,
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
      projects: ReadonlyArray<TicketIndexProject>,
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

    const countAssignedByStatus = (
      projects: ReadonlyArray<TicketIndexProject>,
      scope: TicketIndexAssignedScope
    ) => {
      if (projects.length === 0) return Effect.succeed([])
      const byId = new Map(projects.map((p) => [p.projectId, p]))
      return db
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

    const assignedPerProject = (
      projects: ReadonlyArray<TicketIndexProject>,
      scope: TicketIndexAssignedScope & Readonly<{ perProject: number }>
    ): Effect.Effect<ReadonlyArray<TicketIndexProjectPreview>> => {
      if (projects.length === 0) return Effect.succeed([])
      const ranked = db
        .select({
          ...entryColumns,
          rank: drizzleSql<number>`row_number() over (
            partition by ${ticketIndex.projectId}
            order by ${ticketIndex.updatedAt} desc, ${ticketIndex.ticketId} desc
          )`
            .mapWith(Number)
            .as("rank"),
          total: drizzleSql<number>`count(*) over (
            partition by ${ticketIndex.projectId}
          )`
            .mapWith(Number)
            .as("total")
        })
        .from(ticketIndex)
        .where(acrossProjects(projects, assignedConditions(scope)))
        .as("ranked")
      return db
        .select()
        .from(ranked)
        .where(lte(ranked.rank, Math.max(1, scope.perProject)))
        .orderBy(asc(ranked.projectId), asc(ranked.rank))
        .pipe(
          Effect.map((rows) => {
            const byProject = new Map<string, TicketIndexProjectPreview>()
            for (const { rank: _rank, total, ...row } of rows) {
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

    const assignedTo = (
      projects: ReadonlyArray<TicketIndexProject>,
      options: TicketIndexAssignedOptions
    ): Effect.Effect<ReadonlyArray<TicketIndexOrgEntry>> =>
      queryAcross(
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

    const touchedBy = (
      projects: ReadonlyArray<TicketIndexProject>,
      options: TicketIndexTouchedOptions
    ): Effect.Effect<ReadonlyArray<TicketIndexTouchedEntry>> => {
      if (projects.length === 0) return Effect.succeed([])
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
      const activityAt = drizzleSql`greatest(
        case when ${ticketIndex.createdBy} = ${options.viewerId}
          then ${ticketIndex.createdAt} end,
        ${lastCommentAt}
      )`
      return db
        .select({
          ...entryColumns,
          lastCommentAt: lastCommentAt.mapWith(commentIndex.createdAt)
        })
        .from(ticketIndex)
        .where(
          acrossProjects(projects, [
            or(
              eq(ticketIndex.createdBy, options.viewerId),
              arrayContains(ticketIndex.assignees, [options.viewerId]),
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
              lastCommentAt: row.lastCommentAt
            }))
          ),
          Effect.orDie
        )
    }

    const orderKeyFor = (
      project: TicketIndexProject,
      ticketId: string,
      sort: TicketSort
    ): Effect.Effect<string | null> =>
      db
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

    const count = (
      project: TicketIndexProject,
      ticketQuery: TicketCountQuery,
      options: TicketIndexCountOptions
    ): Effect.Effect<TicketIndexCounts> => {
      if (options.ticketIds?.length === 0) {
        return Effect.succeed({ total: 0, byStatus: {} })
      }
      return db
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
    }

    const listIds = (
      project: TicketIndexProject
    ): Effect.Effect<ReadonlyArray<string>> =>
      db
        .select({ ticketId: ticketIndex.ticketId })
        .from(ticketIndex)
        .where(eq(ticketIndex.projectId, project.projectId))
        .pipe(
          Effect.map((rows) => rows.map((row) => row.ticketId)),
          Effect.orDie
        )

    const existingIds = (
      project: TicketIndexProject,
      ticketIds: ReadonlyArray<string>
    ): Effect.Effect<ReadonlySet<string>> => {
      if (ticketIds.length === 0) return Effect.succeed(new Set())
      return db
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
    }

    const reserveTicketNumber = (
      project: TicketIndexProject
    ): Effect.Effect<number> =>
      db
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

    const tagUsageCounts = (
      project: TicketIndexProject
    ): Effect.Effect<Readonly<Record<string, number>>> =>
      db
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

    const findTicketIdsByTag = (
      project: TicketIndexProject,
      tag: string
    ): Effect.Effect<ReadonlyArray<string>> =>
      db
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

    const findTicketIdsByStatus = (
      project: TicketIndexProject,
      status: string
    ): Effect.Effect<ReadonlyArray<string>> =>
      db
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

    const syncTicketBranches = (
      project: TicketIndexProject,
      document: TicketDocument
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

    const upsertTicket = (
      project: TicketIndexProject,
      document: TicketDocument
    ): Effect.Effect<void> =>
      sql
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
          })
        )
        .pipe(
          Effect.asVoid,
          Effect.retry({
            schedule: Schedule.exponential(
              TICKET_INDEX_PUBLISH_RETRY_BASE
            ).pipe(
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
                slug: project.projectSlug,
                projectId: project.projectId,
                ticketId: document.id
              }),
              Effect.andThen(repairs.markUnpublished(project))
            )
          )
        )

    const deleteTicket = (
      project: TicketIndexProject,
      ticketId: string
    ): Effect.Effect<void> =>
      db
        .delete(ticketIndex)
        .where(
          and(
            eq(ticketIndex.projectId, project.projectId),
            eq(ticketIndex.ticketId, ticketId)
          )
        )
        .pipe(Effect.asVoid, Effect.orDie)

    return TicketIndex.of({
      projectFor,
      projectsFor,
      assignedTo,
      countAssignedByStatus,
      assignedPerProject,
      touchedBy,
      list,
      query,
      querySections,
      orderKeyFor,
      count,
      listIds,
      existingIds,
      reserveTicketNumber,
      tagUsageCounts,
      findTicketIdsByTag,
      findTicketIdsByStatus,
      upsertTicket,
      deleteTicket
    })
  })
)
