import { TicketPolicy } from "@pp/access/policies"
import { Db } from "@pp/db"
import {
  DEFAULT_TICKET_SORT,
  EPIC_SECTION_NONE,
  type EpicSectionKey,
  estimationUnit,
  type Forbidden,
  type GroupId,
  type GroupIdFilter,
  MY_TICKETS_DONE_WINDOW_DAYS,
  MY_TICKETS_PAGE_SIZE,
  MY_TICKETS_PER_PROJECT,
  type MyTicketsQuery,
  type NotFound,
  OrgScope,
  type OrgTicketPage,
  type OrgTicketRow,
  paginateSorted,
  ProjectScope,
  type ProjectScopeShape,
  type ProjectTicketsPreview,
  RECENT_TICKETS_LIMIT,
  type RecentTicketActivity,
  type RecentTicketRow,
  sprintSectionKey,
  sprintState,
  summarizeEstimates,
  type Ticket,
  type TicketCountQuery,
  type TicketCounts,
  type TicketDetail,
  type TicketEpicSections,
  TICKET_LIST_LIMIT,
  type TicketListPage,
  type TicketListQuery,
  type TicketPageQuery,
  type TicketSearchQuery,
  type TicketSections,
  type TicketSort,
  type TicketSprintSections,
  TicketType,
  UserId
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { Access } from "../access/Access"
import { Groups } from "../groups/Groups"
import { Library } from "../library/Library"
import type { MarkdownError } from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import { ProjectDocs } from "../projects/ProjectDocs"
import { readProjectDocument } from "../projects/readProjectDocument"
import * as TicketBranchIndex from "./TicketBranchIndex"
import {
  TicketIndex,
  type TicketIndexEntry,
  type TicketIndexOrgEntry,
  type TicketIndexProject,
  type TicketIndexQueryEntry,
  type TicketIndexTouchedEntry
} from "./TicketIndex"
import {
  type GitView,
  indexEntryToTicket,
  indexProjectOf,
  requirePolicy,
  type TicketReadError
} from "./ticketPresentation"
import * as TicketView from "./TicketView"

const makeUserId = Schema.decodeUnknownSync(UserId)
const EPIC_SECTION_SORT: TicketSort = { key: "title", dir: "asc" }
const EPIC_SECTIONS_LIMIT = 200

export function recentActivityOf(
  entry: Pick<TicketIndexTouchedEntry, "lastCommentAt"> &
    Readonly<{ entry: Pick<TicketIndexEntry, "createdBy" | "createdAt"> }>,
  viewerId: UserId
): RecentTicketActivity {
  const created =
    entry.entry.createdBy === viewerId ? entry.entry.createdAt : null
  const commented = entry.lastCommentAt
  if (commented !== null && (created === null || commented >= created)) {
    return { tag: "commented", actor: viewerId, at: commented }
  }
  if (created !== null) return { tag: "created", actor: viewerId, at: created }
  return { tag: "assigned" }
}

function ticketPage(
  entries: ReadonlyArray<TicketIndexQueryEntry>,
  query: TicketListQuery,
  view: GitView,
  limit: number
): TicketListPage {
  const page = paginateSorted(entries, {
    cursor: undefined,
    limit,
    sortKey: (row) => row.sortValue,
    id: (row) => row.entry.id,
    dir: query.sort.dir
  })
  return {
    items: page.items.map(({ entry, orderKey }) => ({
      ticket: indexEntryToTicket(entry, view),
      orderKey
    })),
    nextCursor: page.nextCursor
  }
}

export class TicketQueries extends Context.Service<
  TicketQueries,
  Readonly<{
    mine: (
      query: MyTicketsQuery
    ) => Effect.Effect<OrgTicketPage, never, OrgScope>
    mineByProject: () => Effect.Effect<
      ReadonlyArray<ProjectTicketsPreview>,
      never,
      OrgScope
    >
    recent: () => Effect.Effect<ReadonlyArray<RecentTicketRow>, never, OrgScope>
    sections: (
      query: TicketListQuery
    ) => Effect.Effect<
      TicketSections,
      Forbidden | NotFound | MarkdownError,
      ProjectScope
    >
    sprintSections: (
      query: TicketListQuery
    ) => Effect.Effect<
      TicketSprintSections,
      Forbidden | NotFound | MarkdownError,
      ProjectScope
    >
    epicSections: (
      query: TicketListQuery
    ) => Effect.Effect<
      TicketEpicSections,
      Forbidden | NotFound | MarkdownError,
      ProjectScope
    >
    list: (
      query: TicketPageQuery,
      limit?: number
    ) => Effect.Effect<
      TicketListPage,
      Forbidden | NotFound | MarkdownError,
      ProjectScope
    >
    count: (
      query: TicketCountQuery
    ) => Effect.Effect<
      TicketCounts,
      Forbidden | NotFound | MarkdownError,
      ProjectScope
    >
    search: (
      options: TicketSearchQuery
    ) => Effect.Effect<
      ReadonlyArray<Ticket>,
      NotFound | MarkdownError,
      ProjectScope
    >
    listInGroup: (
      groupId: string
    ) => Effect.Effect<
      ReadonlyArray<Ticket>,
      NotFound | MarkdownError,
      ProjectScope
    >
    tagUsageCounts: () => Effect.Effect<
      Readonly<Record<string, number>>,
      never,
      ProjectScope
    >
    get: (
      id: string
    ) => Effect.Effect<TicketDetail, TicketReadError, ProjectScope>
  }>
>()("@pp/server-core/tickets/TicketQueries") {}

const make = Effect.gen(function* () {
  const ticketIndex = yield* TicketIndex
  const ticketBranchIndex = yield* TicketBranchIndex.TicketBranchIndex
  const groups = yield* Groups
  const db = yield* Db
  const projectDocs = yield* ProjectDocs
  const finishedStatuses = yield* FinishedStatuses
  const library = yield* Library
  const access = yield* Access
  const { gitViewOf, gitView, readTicket, detailOf, withMissingAttachments } =
    yield* TicketView.TicketView

  const queryable = Effect.fnUntraced(function* (
    query: TicketCountQuery | TicketListQuery
  ) {
    yield* requirePolicy((scope) => TicketPolicy.canQuery(scope, query))
    const scope = yield* ProjectScope
    if (
      query.estimate?.length ||
      ("sort" in query && query.sort.key === "estimate")
    ) {
      yield* readProjectDocument({ db, docs: projectDocs, project: scope })
    }
    return scope
  })

  const resolveGroupMembers = (
    project: TicketIndexProject,
    groupIds: ReadonlyArray<GroupIdFilter> | undefined
  ): Effect.Effect<
    ReadonlySet<string> | null,
    NotFound | MarkdownError,
    ProjectScope
  > =>
    Effect.gen(function* () {
      if (groupIds === undefined || groupIds.length === 0) return null
      const wantsUngrouped = groupIds.includes("ungrouped")
      const explicitIds = groupIds.filter((id) => id !== "ungrouped")
      const memberSet = new Set<string>()
      if (explicitIds.length > 0) {
        const details = yield* Effect.forEach(
          explicitIds,
          (id) =>
            groups
              .get(id)
              .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null))),
          { concurrency: 8 }
        )
        for (const g of details) {
          if (g === null) continue
          for (const t of g.tickets) memberSet.add(t)
        }
      }
      if (wantsUngrouped) {
        const allGroups = yield* groups.list()
        const inIncompleteSprint = new Set<string>()
        const now = yield* DateTime.nowAsDate
        for (const g of allGroups) {
          if (g.kind !== "sprint" || sprintState(g, now) === "completed")
            continue
          for (const t of g.tickets) inIncompleteSprint.add(t)
        }
        const allTicketIds = yield* ticketIndex.listIds(project)
        for (const id of allTicketIds) {
          if (!inIncompleteSprint.has(id)) memberSet.add(id)
        }
      }
      return memberSet
    })

  const list = Effect.fn("TicketQueries.list")(function* (
    query: TicketPageQuery,
    limit?: number
  ) {
    const scope = yield* queryable(query)
    const { userId } = scope
    const project = indexProjectOf(scope)
    const groupMemberSet = yield* resolveGroupMembers(project, query.groupId)
    const sectionMemberSet = yield* resolveGroupMembers(
      project,
      query.section?.groupId
    )
    const pageLimit = limit ?? TICKET_LIST_LIMIT
    const queryEntries = yield* ticketIndex.query(project, query, {
      viewerId: userId,
      ticketIds: groupMemberSet === null ? undefined : [...groupMemberSet],
      sectionTicketIds:
        sectionMemberSet === null ? undefined : [...sectionMemberSet],
      limit: pageLimit + 1
    })
    return ticketPage(queryEntries, query, yield* gitView, pageLimit)
  })

  const readableProjects = Effect.gen(function* () {
    const scopes = (yield* access.projectsInOrg()).filter((scope) =>
      scope.permissions.can({ ticket: ["read"] })
    )
    return {
      projects: scopes.map(indexProjectOf),
      scopeOf: new Map(scopes.map((scope) => [scope.projectId, scope]))
    }
  })

  const gitViewsFor = (
    scopes: ReadonlyArray<ProjectScopeShape>
  ): Effect.Effect<ReadonlyMap<string, GitView>> =>
    Effect.forEach(
      scopes,
      (scope) =>
        gitViewOf(scope).pipe(
          Effect.map((view) => [scope.projectId, view] as const)
        ),
      { concurrency: 8 }
    ).pipe(Effect.map((views) => new Map(views)))

  const hiddenGit: GitView = { integration: null, visible: false }

  const orgTicketRows = (
    scopeOf: ReadonlyMap<string, ProjectScopeShape>,
    entries: ReadonlyArray<TicketIndexOrgEntry>
  ): Effect.Effect<ReadonlyArray<OrgTicketRow>> =>
    Effect.gen(function* () {
      const projectIds = new Set(
        entries.map(({ project }) => project.projectId)
      )
      const views = yield* gitViewsFor(
        [...scopeOf.values()].filter((scope) => projectIds.has(scope.projectId))
      )
      return entries.map(({ project, entry }) => ({
        projectSlug: project.projectSlug,
        ticket: indexEntryToTicket(
          entry,
          views.get(project.projectId) ?? hiddenGit
        )
      }))
    })

  const assignedScope = (userId: string) =>
    Effect.map(DateTime.now, (now) => ({
      viewerId: userId,
      doneAfter: DateTime.toDate(
        DateTime.subtract(now, { days: MY_TICKETS_DONE_WINDOW_DAYS })
      )
    }))

  const mine = Effect.fn("TicketQueries.mine")(function* (
    query: MyTicketsQuery
  ) {
    const { userId } = yield* OrgScope
    const { projects: visible, scopeOf } = yield* readableProjects
    const scope = yield* assignedScope(userId)
    const [entries, counts] = yield* Effect.all(
      [
        ticketIndex.assignedTo(visible, {
          ...scope,
          cursor: query.cursor,
          limit: MY_TICKETS_PAGE_SIZE + 1
        }),
        ticketIndex.countAssignedByStatus(visible, scope)
      ],
      { concurrency: "unbounded" }
    )
    const page = paginateSorted(entries, {
      cursor: undefined,
      limit: MY_TICKETS_PAGE_SIZE,
      sortKey: (row) => row.sortValue,
      id: (row) => row.entry.id,
      dir: "desc"
    })
    const items = yield* orgTicketRows(scopeOf, page.items)
    return {
      items,
      nextCursor: page.nextCursor,
      total: counts.reduce((sum, { count }) => sum + count, 0),
      statusCounts: counts.map(({ project, status, count }) => ({
        projectSlug: project.projectSlug,
        status,
        count
      }))
    } satisfies OrgTicketPage
  })

  const mineByProject = Effect.fn("TicketQueries.mineByProject")(function* () {
    const { userId } = yield* OrgScope
    const { projects: visible, scopeOf } = yield* readableProjects
    const scope = yield* assignedScope(userId)
    const previews = yield* ticketIndex.assignedPerProject(visible, {
      ...scope,
      perProject: MY_TICKETS_PER_PROJECT
    })
    const views = yield* gitViewsFor(
      previews.flatMap(({ project }) => {
        const found = scopeOf.get(project.projectId)
        return found ? [found] : []
      })
    )
    return previews.map(
      ({ project, total, entries }): ProjectTicketsPreview => ({
        projectSlug: project.projectSlug,
        total,
        tickets: entries.map((entry) =>
          indexEntryToTicket(entry, views.get(project.projectId) ?? hiddenGit)
        )
      })
    )
  })

  const recent = Effect.fn("TicketQueries.recent")(function* () {
    const { userId } = yield* OrgScope
    const { projects: visible, scopeOf } = yield* readableProjects
    const entries = yield* ticketIndex.touchedBy(visible, {
      viewerId: userId,
      limit: RECENT_TICKETS_LIMIT
    })
    const rows = yield* orgTicketRows(scopeOf, entries)
    const viewerId = makeUserId(userId)
    return rows.map(
      (row, index): RecentTicketRow => ({
        ...row,
        activity: recentActivityOf(entries[index], viewerId)
      })
    )
  })

  const listInGroup = Effect.fn("TicketQueries.listInGroup")(function* (
    groupId: string
  ) {
    const project = indexProjectOf(yield* ProjectScope)
    const group = yield* groups.get(groupId)
    const entries = yield* ticketIndex.list(project, group.tickets)
    const byId = new Map(entries.map((entry) => [entry.id, entry]))
    const view = yield* gitView
    return group.tickets.flatMap((id) => {
      const entry = byId.get(id)
      if (!entry || entry.archivedAt !== null) return []
      return [indexEntryToTicket(entry, view)]
    })
  })

  const SEARCH_DEFAULT_LIMIT = 24
  const SEARCH_MAX_LIMIT = 100

  const search = Effect.fn("TicketQueries.search")(function* (
    options: TicketSearchQuery
  ) {
    const scope = yield* ProjectScope
    const { userId } = scope
    const project = indexProjectOf(scope)
    const excludedTicketIds = options.excludeGroupId
      ? (yield* groups
          .get(options.excludeGroupId)
          .pipe(
            Effect.catchTag("NotFound", () => Effect.succeed({ tickets: [] }))
          )).tickets
      : undefined
    const limit = Math.min(
      Math.max(1, options.limit ?? SEARCH_DEFAULT_LIMIT),
      SEARCH_MAX_LIMIT
    )
    const attachParent =
      options.attachableTo === undefined
        ? undefined
        : (yield* ticketIndex.list(project, [options.attachableTo]))[0]
    const queryEntries = yield* ticketIndex.query(
      project,
      { q: options.q, sort: DEFAULT_TICKET_SORT },
      {
        viewerId: userId,
        excludeTicketIds: excludedTicketIds,
        attachableTo:
          options.attachableTo === undefined
            ? undefined
            : {
                parent: options.attachableTo,
                leavesOnly: attachParent?.type !== "epic"
              },
        limit
      }
    )
    const view = yield* gitView
    return queryEntries.map(({ entry }) => indexEntryToTicket(entry, view))
  })

  const tagUsageCounts = Effect.fn("TicketQueries.tagUsageCounts")(
    function* () {
      const scope = yield* ProjectScope
      return yield* ticketIndex.tagUsageCounts(indexProjectOf(scope))
    }
  )

  const count = Effect.fn("TicketQueries.count")(function* (
    query: TicketCountQuery
  ) {
    const scope = yield* queryable(query)
    const { userId } = scope
    const project = indexProjectOf(scope)
    const groupMemberSet = yield* resolveGroupMembers(project, query.groupId)
    const queryForCount: TicketCountQuery = {
      ...query,
      status: undefined
    }
    const counts = yield* ticketIndex.count(project, queryForCount, {
      viewerId: userId,
      ticketIds: groupMemberSet === null ? undefined : [...groupMemberSet]
    })
    return {
      total: counts.total,
      byStatus: counts.byStatus
    }
  })

  const sections = Effect.fn("TicketQueries.sections")(function* (
    query: TicketListQuery
  ) {
    const scope = yield* queryable(query)
    const { userId } = scope
    const project = indexProjectOf(scope)
    const groupMemberSet = yield* resolveGroupMembers(project, query.groupId)
    const options = {
      viewerId: userId,
      ticketIds: groupMemberSet === null ? undefined : [...groupMemberSet]
    }
    const bySection = yield* ticketIndex.querySections(
      project,
      { ...query, cursor: undefined },
      { ...options, limit: TICKET_LIST_LIMIT + 1, sections: "status" }
    )
    const byStatus: Record<string, number> = {}
    let total = 0
    for (const [status, section] of bySection) {
      byStatus[status] = section.counts.total
      total += section.counts.total
    }
    const counts = { total, byStatus }
    const view = yield* gitView
    const pages = Object.keys(byStatus)
      .filter(
        (status) =>
          !query.status?.length ||
          query.status.some((requested) => requested === status)
      )
      .map(
        (status) =>
          [
            status,
            ticketPage(
              bySection.get(status)?.entries ?? [],
              query,
              view,
              TICKET_LIST_LIMIT
            )
          ] as const
      )
    return { counts, sections: Object.fromEntries(pages) }
  })

  const sprintSections = Effect.fn("TicketQueries.sprintSections")(function* (
    query: TicketListQuery
  ) {
    const scope = yield* queryable(query)
    const { userId } = scope
    const project = indexProjectOf(scope)
    const sprints = (yield* groups.list()).filter(
      (group) => group.kind === "sprint"
    )
    const unit = estimationUnit(
      (yield* readProjectDocument({ db, docs: projectDocs, project: scope }))
        .estimation
    )
    const sectionIds: ReadonlyArray<GroupIdFilter> = [
      ...new Set<GroupIdFilter>(
        query.groupId?.length
          ? query.groupId
          : ["ungrouped", ...sprints.map((sprint) => sprint.id)]
      )
    ]
    const view = yield* gitView
    const selectedSections = new Set(sectionIds)
    const claimed = new Set<string>()
    const bySprint = new Map<GroupId, Array<string>>()
    const takeUnclaimed = (tickets: ReadonlyArray<string>) => {
      const ids: Array<string> = []
      for (const id of tickets) {
        if (claimed.has(id)) continue
        claimed.add(id)
        ids.push(id)
      }
      return ids
    }
    for (const sprint of sprints) {
      if (sprint.completedAt === null && selectedSections.has(sprint.id)) {
        bySprint.set(sprint.id, takeUnclaimed(sprint.tickets))
      }
    }
    for (const sprint of sprints) {
      if (sprint.completedAt !== null && selectedSections.has(sprint.id)) {
        bySprint.set(sprint.id, takeUnclaimed(sprint.tickets))
      }
    }
    const ungroupedMembers = query.groupId?.includes("ungrouped")
      ? yield* resolveGroupMembers(project, ["ungrouped"])
      : null
    const members = yield* Effect.forEach(
      sectionIds,
      (groupId) =>
        Effect.gen(function* () {
          const known =
            groupId === "ungrouped" ? undefined : bySprint.get(groupId)
          const ticketIds =
            groupId === "ungrouped"
              ? ungroupedMembers === null
                ? undefined
                : [...ungroupedMembers].filter((id) => !claimed.has(id))
              : known !== undefined
                ? known
                : yield* resolveGroupMembers(project, [groupId]).pipe(
                    Effect.map((members) =>
                      members === null
                        ? []
                        : [...members].filter((id) => !claimed.has(id))
                    )
                  )
          return { key: groupId, ticketIds }
        }),
      { concurrency: 4 }
    )
    const bySection = yield* ticketIndex.querySections(
      project,
      { ...query, groupId: undefined, cursor: undefined },
      {
        viewerId: userId,
        limit: TICKET_LIST_LIMIT + 1,
        sections: members
      }
    )
    const estimatedIds =
      unit === null
        ? []
        : members.flatMap(({ key, ticketIds }) =>
            key === "ungrouped" || ticketIds === undefined ? [] : ticketIds
          )
    const estimatedEntries = new Map(
      (estimatedIds.length === 0
        ? []
        : yield* ticketIndex.list(project, estimatedIds)
      ).map((entry): [string, typeof entry] => [entry.id, entry])
    )
    const finished =
      unit === null
        ? null
        : yield* finishedStatuses.forProject(
            project.orgSlug,
            project.projectSlug
          )
    const emptyCounts = { total: 0, byStatus: {} as Record<string, number> }
    const pages = members.map(({ key: groupId, ticketIds }) => {
      const result = bySection.get(groupId)
      const counts = result?.counts ?? emptyCounts
      const estimates =
        unit === null ||
        finished === null ||
        groupId === "ungrouped" ||
        ticketIds === undefined
          ? null
          : summarizeEstimates(
              ticketIds.flatMap((id) => {
                const entry = estimatedEntries.get(id)
                return entry === undefined || entry.archivedAt !== null
                  ? []
                  : [entry]
              }),
              unit,
              finished
            )
      return {
        section: {
          key: sprintSectionKey(groupId === "ungrouped" ? null : groupId),
          count: query.status?.length
            ? [...new Set(query.status)].reduce(
                (sum, status) => sum + (counts.byStatus[status] ?? 0),
                0
              )
            : counts.total,
          page: ticketPage(
            result?.entries ?? [],
            query,
            view,
            TICKET_LIST_LIMIT
          ),
          estimates
        },
        counts
      }
    })
    const byStatus: Record<string, number> = {}
    for (const { counts } of pages) {
      for (const [status, count] of Object.entries(counts.byStatus)) {
        byStatus[status] = (byStatus[status] ?? 0) + count
      }
    }
    const sections = pages.map(({ section }) => section)
    return {
      total: sections.reduce((sum, section) => sum + section.count, 0),
      counts: {
        total: pages.reduce((sum, { counts }) => sum + counts.total, 0),
        byStatus
      },
      sections
    }
  })

  const epicSections = Effect.fn("TicketQueries.epicSections")(function* (
    query: TicketListQuery
  ) {
    const scope = yield* queryable(query)
    const { userId } = scope
    const project = indexProjectOf(scope)
    const groupMemberSet = yield* resolveGroupMembers(project, query.groupId)
    const epicOptions = { viewerId: userId, limit: EPIC_SECTIONS_LIMIT }
    const [openEpics, archivedEpics] = yield* Effect.all(
      [
        ticketIndex.query(
          project,
          { type: ["epic"], sort: EPIC_SECTION_SORT },
          epicOptions
        ),
        ticketIndex.query(
          project,
          { type: ["epic"], archived: true, sort: EPIC_SECTION_SORT },
          epicOptions
        )
      ],
      { concurrency: 2 }
    )
    const archivedIds = new Set<string>(
      archivedEpics.map(({ entry }) => entry.id)
    )
    const sectionsWanted: ReadonlyArray<
      Readonly<{ key: EpicSectionKey; title: string | null }>
    > = [
      ...[...openEpics, ...archivedEpics]
        .map(({ entry }) => ({ key: entry.id, title: entry.title }))
        .toSorted((a, b) => a.title.localeCompare(b.title)),
      { key: EPIC_SECTION_NONE, title: null }
    ]
    const bySection = yield* ticketIndex.querySections(
      project,
      {
        ...query,
        type: (query.type?.length ? query.type : TicketType.literals).filter(
          (type) => type !== "epic"
        ),
        parent: sectionsWanted.map(({ key }) => key),
        groupId: undefined,
        cursor: undefined
      },
      {
        viewerId: userId,
        ticketIds: groupMemberSet === null ? undefined : [...groupMemberSet],
        limit: TICKET_LIST_LIMIT + 1,
        sections: "parent"
      }
    )
    const view = yield* gitView
    const emptyCounts = { total: 0, byStatus: {} as Record<string, number> }
    const pages = sectionsWanted.map(({ key, title }) => {
      const result = bySection.get(key)
      const counts = result?.counts ?? emptyCounts
      return {
        section: {
          key,
          title,
          count: query.status?.length
            ? [...new Set(query.status)].reduce(
                (sum, status) => sum + (counts.byStatus[status] ?? 0),
                0
              )
            : counts.total,
          page: ticketPage(
            result?.entries ?? [],
            query,
            view,
            TICKET_LIST_LIMIT
          )
        },
        counts
      }
    })
    const byStatus: Record<string, number> = {}
    for (const { counts } of pages) {
      for (const [status, count] of Object.entries(counts.byStatus)) {
        byStatus[status] = (byStatus[status] ?? 0) + count
      }
    }
    const sections = pages
      .map(({ section }) => section)
      .filter((section) => section.count > 0 || !archivedIds.has(section.key))
    return {
      total: sections.reduce((sum, section) => sum + section.count, 0),
      counts: {
        total: pages.reduce((sum, { counts }) => sum + counts.total, 0),
        byStatus
      },
      sections
    }
  })

  const get = Effect.fn("TicketQueries.get")(function* (id: string) {
    const scope = yield* ProjectScope
    const { orgSlug, slug, userId } = scope
    const view = yield* gitView
    const ticket = yield* readTicket(orgSlug, slug, id)
    const body = yield* library.resolveSynced(orgSlug, slug, ticket.body)
    const branchDeletedAt = yield* ticketBranchIndex.getBranchDeletedAt(
      orgSlug,
      slug,
      id
    )
    const { total: subTicketCount } = yield* ticketIndex.count(
      indexProjectOf(scope),
      { parent: [ticket.id] },
      { viewerId: userId }
    )
    const detail = yield* detailOf({ ...ticket, body }, view, branchDeletedAt)
    return yield* withMissingAttachments(orgSlug, {
      ...detail,
      subTicketCount
    })
  })

  return TicketQueries.of({
    mine,
    mineByProject,
    recent,
    sections,
    sprintSections,
    epicSections,
    list,
    count,
    search,
    listInGroup,
    tagUsageCounts,
    get
  })
})

export const layer = Layer.effect(TicketQueries, make)
