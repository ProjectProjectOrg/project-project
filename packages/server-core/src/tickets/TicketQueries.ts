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
  backlogSprintSections,
  MY_TICKETS_DONE_WINDOW_DAYS,
  MY_TICKETS_PAGE_SIZE,
  MY_TICKETS_PER_PROJECT,
  type MyTicketsQuery,
  NotFound,
  MovedTicketLocation,
  type CurrentUser,
  OrgScope,
  type OrgTicketPage,
  type OrgTicketRow,
  paginateSorted,
  ProjectScope,
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
  type TicketEpicSection,
  type TicketParent,
  type TicketEpicSections,
  TICKET_LIST_LIMIT,
  type TicketListPage,
  type TicketListQuery,
  type TicketPageQuery,
  type TicketSearchQuery,
  type TicketTextHit,
  type TicketTextSearchQuery,
  type TicketTitle,
  type TicketNeighbors,
  type TicketViewSource,
  type TicketSections,
  type TicketSort,
  type TicketSprintSections,
  TicketType,
  type User,
  UserId
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import * as Access from "../access/Access"
import { presentActor } from "../activity/actorRow"
import * as TicketBranchIndex from "../git/TicketBranchIndex"
import * as Groups from "../groups/Groups"
import * as Library from "../library/Library"
import { parseMarkdownFile } from "../markdown/fileContent"
import type * as Markdown from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import * as ProjectDocs from "../projects/ProjectDocs"
import { readProjectDocument } from "../projects/readProjectDocument"
import * as Users from "../users/Users"
import { compareByRank } from "./ranks"
import * as TicketDocs from "./TicketDocs"
import * as TicketIndex from "./TicketIndex"
import {
  type GitView,
  indexEntryToTicket,
  requirePolicy,
  type TicketReadError
} from "./ticketPresentation"
import type { TicketProject } from "./ticketProject"
import {
  matchTicketText,
  searchWords,
  type TicketTextMatch
} from "./ticketTextSearch"
import * as TicketView from "./TicketView"

const makeUserId = Schema.decodeUnknownSync(UserId)
const EPIC_SECTION_SORT: TicketSort = { key: "title", dir: "asc" }
const EPIC_SECTIONS_LIMIT = 200

type RecentCandidate = Readonly<{
  at: Date
  activity: RecentTicketActivity
}>

const touchedEventCandidate = (
  event: TicketIndex.TicketIndexTouchedEvent | null,
  users: ReadonlyMap<string, User>
): RecentCandidate | null => {
  if (event === null) return null
  const actor = presentActor(event.actor, users)
  if (event.change.kind === "status_changed") {
    return actor === null
      ? null
      : {
          at: event.occurredAt,
          activity: {
            tag: "status_changed",
            actor,
            at: event.occurredAt,
            from: event.change.from,
            to: event.change.to
          }
        }
  }
  return {
    at: event.occurredAt,
    activity:
      actor === null
        ? { tag: "assigned", at: event.occurredAt }
        : { tag: "assigned", actor, at: event.occurredAt }
  }
}

export function recentActivityOf(
  entry: Pick<
    TicketIndex.TicketIndexTouchedEntry,
    "lastCommentAt" | "assignedEvent" | "statusEvent"
  > &
    Readonly<{
      entry: Pick<TicketIndex.TicketIndexEntry, "createdBy" | "createdAt">
    }>,
  viewerId: UserId,
  users: ReadonlyMap<string, User>
): RecentTicketActivity {
  const candidates: ReadonlyArray<RecentCandidate | null> = [
    touchedEventCandidate(entry.statusEvent, users),
    touchedEventCandidate(entry.assignedEvent, users),
    entry.lastCommentAt === null
      ? null
      : {
          at: entry.lastCommentAt,
          activity: { tag: "commented", at: entry.lastCommentAt }
        },
    entry.entry.createdBy === viewerId
      ? {
          at: entry.entry.createdAt,
          activity: { tag: "created", at: entry.entry.createdAt }
        }
      : null
  ]
  const latest = candidates.reduce<RecentCandidate | null>(
    (best, candidate) =>
      candidate !== null && (best === null || candidate.at > best.at)
        ? candidate
        : best,
    null
  )
  return latest?.activity ?? { tag: "assigned" }
}

const touchedActorIds = (
  entries: ReadonlyArray<TicketIndex.TicketIndexTouchedEntry>
): ReadonlyArray<string> => [
  ...new Set(
    entries.flatMap(({ assignedEvent, statusEvent }) =>
      [assignedEvent, statusEvent].flatMap((event) =>
        event === null || event.actor.kind === "system"
          ? []
          : [event.actor.userId]
      )
    )
  )
]

function ticketPage(
  entries: ReadonlyArray<TicketIndex.TicketIndexQueryEntry>,
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
      Forbidden | NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    sprintSections: (
      query: TicketListQuery
    ) => Effect.Effect<
      TicketSprintSections,
      Forbidden | NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    epicSections: (
      query: TicketListQuery
    ) => Effect.Effect<
      TicketEpicSections,
      Forbidden | NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    parentSections: (
      query: TicketListQuery
    ) => Effect.Effect<
      TicketEpicSections,
      Forbidden | NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    neighbors: (
      ticketId: string,
      source: TicketViewSource
    ) => Effect.Effect<
      TicketNeighbors | null,
      Forbidden | NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    list: (
      query: TicketPageQuery,
      limit?: number
    ) => Effect.Effect<
      TicketListPage,
      Forbidden | NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    count: (
      query: TicketCountQuery
    ) => Effect.Effect<
      TicketCounts,
      Forbidden | NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    search: (
      options: TicketSearchQuery
    ) => Effect.Effect<
      ReadonlyArray<Ticket>,
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
    titles: () => Effect.Effect<ReadonlyArray<TicketTitle>, never, ProjectScope>
    textSearch: (
      options: TicketTextSearchQuery
    ) => Effect.Effect<
      ReadonlyArray<TicketTextHit>,
      Markdown.MarkdownError,
      ProjectScope
    >
    listInGroup: (
      groupId: string
    ) => Effect.Effect<
      ReadonlyArray<Ticket>,
      NotFound | Markdown.MarkdownError,
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
    movedTo: (
      id: string
    ) => Effect.Effect<
      MovedTicketLocation,
      NotFound,
      ProjectScope | CurrentUser
    >
  }>
>()("@pp/server-core/tickets/TicketQueries") {}

const decodeMovedTicketLocation = Schema.decodeUnknownSync(MovedTicketLocation)

const decodeTextFrontmatter = Schema.decodeUnknownOption(
  Schema.Struct({
    title: Schema.String,
    archivedAt: Schema.optional(Schema.NullOr(Schema.Unknown))
  })
)

const make = Effect.gen(function* () {
  const ticketIndex = yield* TicketIndex.TicketIndex
  const ticketBranchIndex = yield* TicketBranchIndex.TicketBranchIndex
  const groups = yield* Groups.Groups
  const db = yield* Db
  const projectDocs = yield* ProjectDocs.ProjectDocs
  const finishedStatuses = yield* FinishedStatuses
  const library = yield* Library.Library
  const access = yield* Access.Access
  const users = yield* Users.Users
  const ticketDocs = yield* TicketDocs.TicketDocs
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
    project: TicketProject,
    groupIds: ReadonlyArray<GroupIdFilter> | undefined
  ): Effect.Effect<
    ReadonlySet<string> | null,
    NotFound | Markdown.MarkdownError,
    ProjectScope
  > =>
    Effect.gen(function* () {
      if (groupIds === undefined || groupIds.length === 0) return null
      const wantsUngrouped = groupIds.includes("ungrouped")
      const explicitIds = groupIds.filter((id) => id !== "ungrouped")
      const memberSet = new Set<string>()
      const [details, ungrouped] = yield* Effect.all(
        [
          Effect.forEach(
            explicitIds,
            (id) =>
              groups
                .get(id)
                .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null))),
            { concurrency: 8 }
          ),
          wantsUngrouped
            ? Effect.all([groups.list(), ticketIndex.listIds(project)], {
                concurrency: 2
              })
            : Effect.succeed(null)
        ],
        { concurrency: 2 }
      )
      for (const g of details) {
        if (g === null) continue
        for (const t of g.tickets) memberSet.add(t)
      }
      if (ungrouped !== null) {
        const [allGroups, allTicketIds] = ungrouped
        const inIncompleteSprint = new Set<string>()
        const now = yield* DateTime.nowAsDate
        for (const g of allGroups) {
          if (g.kind !== "sprint" || sprintState(g, now) === "completed")
            continue
          for (const t of g.tickets) inIncompleteSprint.add(t)
        }
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
    const [groupMemberSet, sectionMemberSet] = yield* Effect.all(
      [
        resolveGroupMembers(scope, query.groupId),
        resolveGroupMembers(scope, query.section?.groupId)
      ],
      { concurrency: 2 }
    )
    const pageLimit = limit ?? TICKET_LIST_LIMIT
    const [queryEntries, view] = yield* Effect.all(
      [
        ticketIndex.query(scope, query, {
          viewerId: userId,
          ticketIds: groupMemberSet === null ? undefined : [...groupMemberSet],
          sectionTicketIds:
            sectionMemberSet === null ? undefined : [...sectionMemberSet],
          limit: pageLimit + 1
        }),
        gitView
      ],
      { concurrency: 2 }
    )
    return ticketPage(queryEntries, query, view, pageLimit)
  })

  const readableProjects = Effect.gen(function* () {
    const scopes = (yield* access.projectsInOrg()).filter((scope) =>
      scope.permissions.can({ ticket: ["read"] })
    )
    return {
      projects: scopes,
      scopeOf: new Map(scopes.map((scope) => [scope.projectId, scope]))
    }
  })

  const gitViewsFor = (
    scopes: ReadonlyArray<ProjectScope["Service"]>
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
    scopeOf: ReadonlyMap<string, ProjectScope["Service"]>,
    entries: ReadonlyArray<TicketIndex.TicketIndexOrgEntry>
  ): Effect.Effect<ReadonlyArray<OrgTicketRow>> =>
    Effect.gen(function* () {
      const projectIds = new Set(
        entries.map(({ project }) => project.projectId)
      )
      const views = yield* gitViewsFor(
        [...scopeOf.values()].filter((scope) => projectIds.has(scope.projectId))
      )
      return entries.map(({ project, entry }) => ({
        projectSlug: project.slug,
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
        projectSlug: project.slug,
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
        projectSlug: project.slug,
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
      gitProjectIds: [...scopeOf.values()]
        .filter((scope) => scope.permissions.can({ github: ["read"] }))
        .map((scope) => scope.projectId),
      limit: RECENT_TICKETS_LIMIT
    })
    const rows = yield* orgTicketRows(scopeOf, entries)
    const actors = yield* users.fullByIds(touchedActorIds(entries))
    const actorsById = new Map(actors.map((actor) => [actor.id, actor]))
    const viewerId = makeUserId(userId)
    return rows.map(
      (row, index): RecentTicketRow => ({
        ...row,
        activity: recentActivityOf(entries[index], viewerId, actorsById)
      })
    )
  })

  const listInGroup = Effect.fn("TicketQueries.listInGroup")(function* (
    groupId: string
  ) {
    const scope = yield* ProjectScope
    const [group, view] = yield* Effect.all([groups.get(groupId), gitView], {
      concurrency: 2
    })
    const entries = yield* ticketIndex.list(scope, group.tickets)
    return entries
      .filter((entry) => entry.archivedAt === null)
      .toSorted(compareByRank)
      .map((entry) => indexEntryToTicket(entry, view))
  })

  const SEARCH_DEFAULT_LIMIT = 24
  const SEARCH_MAX_LIMIT = 100

  const search = Effect.fn("TicketQueries.search")(function* (
    options: TicketSearchQuery
  ) {
    const scope = yield* ProjectScope
    const { userId } = scope
    const [excludedTicketIds, attachParent, view] = yield* Effect.all(
      [
        options.excludeGroupId
          ? groups.get(options.excludeGroupId).pipe(
              Effect.catchTag("NotFound", () =>
                Effect.succeed({ tickets: [] })
              ),
              Effect.map(({ tickets }) => tickets)
            )
          : Effect.succeed(undefined),
        options.attachableTo === undefined
          ? Effect.succeed(undefined)
          : ticketIndex
              .list(scope, [options.attachableTo])
              .pipe(Effect.map((entries) => entries[0])),
        gitView
      ],
      { concurrency: "unbounded" }
    )
    const limit = Math.min(
      Math.max(1, options.limit ?? SEARCH_DEFAULT_LIMIT),
      SEARCH_MAX_LIMIT
    )
    const queryEntries = yield* ticketIndex.query(
      scope,
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
    return queryEntries.map(({ entry }) => indexEntryToTicket(entry, view))
  })

  const titles = Effect.fn("TicketQueries.titles")(function* () {
    const scope = yield* ProjectScope
    const entries = yield* ticketIndex.list(scope)
    return entries.flatMap(
      (entry): ReadonlyArray<TicketTitle> =>
        entry.archivedAt === null ? [{ id: entry.id, title: entry.title }] : []
    )
  })

  const TEXT_SEARCH_DEFAULT_LIMIT = 20
  const ticketIdCollator = new Intl.Collator(undefined, { numeric: true })

  type RankedTextMatch = Readonly<
    TicketTitle & { match: TicketTextMatch; position: number }
  >

  const textSearch = Effect.fn("TicketQueries.textSearch")(function* (
    options: TicketTextSearchQuery
  ) {
    const { orgSlug, slug } = yield* ProjectScope
    const words = searchWords(options.q)
    const ids = yield* ticketDocs.listIds(orgSlug, slug)
    const limit = options.limit ?? TEXT_SEARCH_DEFAULT_LIMIT
    const top: Array<RankedTextMatch> = []
    yield* Effect.forEach(
      ids,
      (id, position) =>
        ticketDocs.readRaw(orgSlug, slug, id).pipe(
          Effect.map(({ content: raw }) => {
            const { data, content } = parseMarkdownFile(raw)
            const frontmatter = decodeTextFrontmatter(data)
            if (
              Option.isNone(frontmatter) ||
              frontmatter.value.archivedAt != null
            ) {
              return
            }
            const { title } = frontmatter.value
            const match = matchTicketText({ title, body: content }, words)
            if (match === null) return
            let low = 0
            let high = top.length
            while (low < high) {
              const middle = (low + high) >>> 1
              const candidate = top[middle]
              const order =
                candidate.match.score - match.score ||
                ticketIdCollator.compare(candidate.id, id) ||
                position - candidate.position
              if (order < 0) high = middle
              else low = middle + 1
            }
            if (low >= limit) return
            top.splice(low, 0, { id, title, match, position })
            if (top.length > limit) top.pop()
          }),
          Effect.catchTag("NotFound", () => Effect.void)
        ),
      { concurrency: 64, discard: true }
    )
    const authorIds = top.flatMap(({ match }) =>
      match.where === "comment" && match.author.kind === "user"
        ? [match.author.userId]
        : []
    )
    const names = new Map(
      (yield* users.findManyByIds(authorIds)).map((user) => [
        user.id,
        user.name
      ])
    )
    return top.flatMap(({ id, title, match }): ReadonlyArray<TicketTextHit> => {
      if (match.where === "title")
        return [{ id, title, match: { where: "title" } }]
      if (match.where === "description") {
        return [
          {
            id,
            title,
            match: { where: "description", snippet: match.snippet }
          }
        ]
      }
      const author =
        match.author.kind === "user"
          ? (names.get(match.author.userId) ?? "")
          : match.author.displayName
      return [
        {
          id,
          title,
          match: { where: "comment", author, snippet: match.snippet }
        }
      ]
    })
  })

  const tagUsageCounts = Effect.fn("TicketQueries.tagUsageCounts")(
    function* () {
      const scope = yield* ProjectScope
      return yield* ticketIndex.tagUsageCounts(scope)
    }
  )

  const count = Effect.fn("TicketQueries.count")(function* (
    query: TicketCountQuery
  ) {
    const scope = yield* queryable(query)
    const { userId } = scope
    const groupMemberSet = yield* resolveGroupMembers(scope, query.groupId)
    const queryForCount: TicketCountQuery = {
      ...query,
      status: undefined
    }
    const counts = yield* ticketIndex.count(scope, queryForCount, {
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
    const groupMemberSet = yield* resolveGroupMembers(scope, query.groupId)
    const options = {
      viewerId: userId,
      ticketIds: groupMemberSet === null ? undefined : [...groupMemberSet]
    }
    const [bySection, view] = yield* Effect.all(
      [
        ticketIndex.querySections(
          scope,
          { ...query, cursor: undefined },
          { ...options, limit: TICKET_LIST_LIMIT + 1, sections: "status" }
        ),
        gitView
      ],
      { concurrency: 2 }
    )
    const byStatus: Record<string, number> = {}
    let total = 0
    for (const [status, section] of bySection) {
      byStatus[status] = section.counts.total
      total += section.counts.total
    }
    const counts = { total, byStatus }
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

  const sprintSectionMembers = Effect.fnUntraced(function* (
    scope: TicketProject,
    query: TicketListQuery
  ) {
    const allGroups = yield* groups.list()
    const now = yield* DateTime.nowAsDate
    const sprints = allGroups.filter((group) => group.kind === "sprint")
    const sectionIds = backlogSprintSections(sprints, query.groupId, now).map(
      (sprint): GroupIdFilter => sprint?.id ?? "ungrouped"
    )
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
      ? yield* resolveGroupMembers(scope, ["ungrouped"])
      : null
    return sectionIds.map((groupId) => ({
      key: groupId,
      ticketIds:
        groupId === "ungrouped"
          ? ungroupedMembers === null
            ? undefined
            : [...ungroupedMembers].filter((id) => !claimed.has(id))
          : (bySprint.get(groupId) ?? [])
    }))
  })

  const sprintSections = Effect.fn("TicketQueries.sprintSections")(function* (
    query: TicketListQuery
  ) {
    const scope = yield* queryable(query)
    const { userId } = scope
    const [members, projectDocument, view] = yield* Effect.all(
      [
        sprintSectionMembers(scope, query),
        readProjectDocument({ db, docs: projectDocs, project: scope }),
        gitView
      ],
      { concurrency: "unbounded" }
    )
    const unit = estimationUnit(projectDocument.estimation)
    const estimatedIds =
      unit === null
        ? []
        : members.flatMap(({ key, ticketIds }) =>
            key === "ungrouped" || ticketIds === undefined ? [] : ticketIds
          )
    const [bySection, estimatedList, phaseOf] = yield* Effect.all(
      [
        ticketIndex.querySections(
          scope,
          { ...query, groupId: undefined, cursor: undefined },
          {
            viewerId: userId,
            limit: TICKET_LIST_LIMIT + 1,
            sections: members
          }
        ),
        estimatedIds.length === 0
          ? Effect.succeed([])
          : ticketIndex.list(scope, estimatedIds),
        unit === null
          ? Effect.succeed(null)
          : finishedStatuses.phasesForProject(scope.orgSlug, scope.slug)
      ],
      { concurrency: "unbounded" }
    )
    const estimatedEntries = new Map(
      estimatedList.map((entry): [string, typeof entry] => [entry.id, entry])
    )
    const emptyCounts = { total: 0, byStatus: {} as Record<string, number> }
    const pages = members.map(({ key: groupId, ticketIds }) => {
      const result = bySection.get(groupId)
      const counts = result?.counts ?? emptyCounts
      const estimates =
        unit === null ||
        phaseOf === null ||
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
              phaseOf
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

  const parentSectionQuery = (query: TicketListQuery): TicketListQuery => ({
    ...query,
    type: (query.type?.length ? query.type : TicketType.literals).filter(
      (type) => type !== "epic"
    ),
    parent: undefined,
    groupId: undefined,
    cursor: undefined
  })

  const parentSectionsOf = Effect.fn("TicketQueries.parentSectionsOf")(
    function* (
      scope: Effect.Success<ReturnType<typeof queryable>>,
      query: TicketListQuery,
      sections: "parent" | "ticketParent",
      groupMemberSet: ReadonlySet<string> | null
    ) {
      return yield* ticketIndex.querySections(
        scope,
        parentSectionQuery(query),
        {
          viewerId: scope.userId,
          ticketIds: groupMemberSet === null ? undefined : [...groupMemberSet],
          limit: TICKET_LIST_LIMIT + 1,
          sections
        }
      )
    }
  )

  const toParentSections = (
    sectionsWanted: ReadonlyArray<
      Readonly<{ key: EpicSectionKey; parent: TicketParent | null }>
    >,
    bySection: TicketIndex.TicketIndexSections,
    query: TicketListQuery,
    view: Effect.Success<typeof gitView>,
    keep: (section: TicketEpicSection) => boolean
  ): TicketEpicSections => {
    const emptyCounts = { total: 0, byStatus: {} as Record<string, number> }
    const pages = sectionsWanted.map(({ key, parent }) => {
      const result = bySection.get(key)
      const counts = result?.counts ?? emptyCounts
      return {
        section: {
          key,
          parent,
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
    const sections = pages.map(({ section }) => section).filter(keep)
    return {
      total: sections.reduce((sum, section) => sum + section.count, 0),
      counts: {
        total: pages.reduce((sum, { counts }) => sum + counts.total, 0),
        byStatus
      },
      sections
    }
  }

  const byTitle = (
    entries: ReadonlyArray<TicketIndex.TicketIndexQueryEntry>
  ): ReadonlyArray<Readonly<{ key: EpicSectionKey; parent: TicketParent }>> =>
    entries
      .map(({ entry }) => ({
        key: entry.id,
        parent: { id: entry.id, title: entry.title, type: entry.type }
      }))
      .toSorted((a, b) => a.parent.title.localeCompare(b.parent.title))

  const NO_PARENT_SECTION = { key: EPIC_SECTION_NONE, parent: null } as const

  const epicSectionsWanted = Effect.fnUntraced(function* (
    scope: ProjectScope["Service"]
  ) {
    const epicOptions = { viewerId: scope.userId, limit: EPIC_SECTIONS_LIMIT }
    const [openEpics, archivedEpics] = yield* Effect.all(
      [
        ticketIndex.query(
          scope,
          { type: ["epic"], sort: EPIC_SECTION_SORT },
          epicOptions
        ),
        ticketIndex.query(
          scope,
          { type: ["epic"], archived: true, sort: EPIC_SECTION_SORT },
          epicOptions
        )
      ],
      { concurrency: "unbounded" }
    )
    return {
      wanted: [...byTitle([...openEpics, ...archivedEpics]), NO_PARENT_SECTION],
      archivedIds: new Set<string>(archivedEpics.map(({ entry }) => entry.id))
    }
  })

  const epicSections = Effect.fn("TicketQueries.epicSections")(function* (
    query: TicketListQuery
  ) {
    const scope = yield* queryable(query)
    const [groupMemberSet, { wanted, archivedIds }, view] = yield* Effect.all(
      [
        resolveGroupMembers(scope, query.groupId),
        epicSectionsWanted(scope),
        gitView
      ],
      { concurrency: "unbounded" }
    )
    const bySection = yield* parentSectionsOf(
      scope,
      query,
      "parent",
      groupMemberSet
    )
    return toParentSections(
      wanted,
      bySection,
      query,
      view,
      (section) => section.count > 0 || !archivedIds.has(section.key)
    )
  })

  const parentSectionsWanted = Effect.fnUntraced(function* (
    scope: ProjectScope["Service"],
    bySection: TicketIndex.TicketIndexSections
  ) {
    const parentIds = [...bySection.keys()].filter(
      (key) => key !== EPIC_SECTION_NONE
    )
    const parentOptions = {
      viewerId: scope.userId,
      ticketIds: parentIds,
      limit: parentIds.length
    }
    const [openParents, archivedParents] =
      parentIds.length === 0
        ? [[], []]
        : yield* Effect.all(
            [
              ticketIndex.query(
                scope,
                { sort: EPIC_SECTION_SORT },
                parentOptions
              ),
              ticketIndex.query(
                scope,
                { archived: true, sort: EPIC_SECTION_SORT },
                parentOptions
              )
            ],
            { concurrency: "unbounded" }
          )
    return [...byTitle([...openParents, ...archivedParents]), NO_PARENT_SECTION]
  })

  const parentSections = Effect.fn("TicketQueries.parentSections")(function* (
    query: TicketListQuery
  ) {
    const scope = yield* queryable(query)
    const [groupMemberSet, view] = yield* Effect.all(
      [resolveGroupMembers(scope, query.groupId), gitView],
      { concurrency: "unbounded" }
    )
    const bySection = yield* parentSectionsOf(
      scope,
      query,
      "ticketParent",
      groupMemberSet
    )
    return toParentSections(
      yield* parentSectionsWanted(scope, bySection),
      bySection,
      query,
      view,
      (section) => section.count > 0 || section.key === EPIC_SECTION_NONE
    )
  })

  const neighbors = Effect.fn("TicketQueries.neighbors")(function* (
    ticketId: string,
    source: TicketViewSource
  ) {
    const scope = yield* queryable(source.query)
    const query = { ...source.query, cursor: undefined }
    const find = (
      ticketQuery: TicketListQuery,
      options: Omit<
        TicketIndex.TicketIndexNeighborsOptions,
        "viewerId" | "ticketId"
      >
    ) =>
      ticketIndex.neighbors(scope, ticketQuery, {
        ...options,
        viewerId: scope.userId,
        ticketId
      })
    if (source.kind === "sprintBoard") {
      const group = yield* groups.get(source.groupId)
      return yield* find(
        {
          ...query,
          groupId: undefined,
          archived: undefined,
          subTickets: "nested"
        },
        {
          ticketIds: group.tickets,
          sections: { kind: "status" },
          within: {
            sort: { key: "manual", dir: "asc" },
            nestAcrossSections: true
          }
        }
      )
    }
    const within = { sort: query.sort }
    switch (source.grouping) {
      case "status": {
        const members = yield* resolveGroupMembers(scope, query.groupId)
        return yield* find(query, {
          ticketIds: members === null ? undefined : [...members],
          sections: { kind: "status" },
          within
        })
      }
      case "sprint": {
        const members = yield* sprintSectionMembers(scope, query)
        return yield* find(
          { ...query, groupId: undefined },
          { sections: { kind: "explicit", sections: members }, within }
        )
      }
      case "epic": {
        const [members, { wanted }] = yield* Effect.all(
          [
            resolveGroupMembers(scope, query.groupId),
            epicSectionsWanted(scope)
          ],
          { concurrency: "unbounded" }
        )
        return yield* find(parentSectionQuery(query), {
          ticketIds: members === null ? undefined : [...members],
          sections: { kind: "parent", keys: wanted.map(({ key }) => key) },
          within
        })
      }
      case "parent": {
        const members = yield* resolveGroupMembers(scope, query.groupId)
        const wanted = yield* parentSectionsWanted(
          scope,
          yield* parentSectionsOf(scope, query, "ticketParent", members)
        )
        return yield* find(parentSectionQuery(query), {
          ticketIds: members === null ? undefined : [...members],
          sections: {
            kind: "ticketParent",
            keys: wanted.map(({ key }) => key)
          },
          within
        })
      }
    }
  })

  const get = Effect.fn("TicketQueries.get")(function* (id: string) {
    const scope = yield* ProjectScope
    const { orgSlug, slug } = scope
    const [view, ticket, branchDeletedAt] = yield* Effect.all(
      [
        gitView,
        readTicket(scope, id),
        ticketBranchIndex.getBranchDeletedAt(scope, id)
      ],
      { concurrency: "unbounded" }
    )
    const [body, entries, detail] = yield* Effect.all(
      [
        library.resolveSynced(orgSlug, slug, ticket.body),
        ticketIndex.list(scope, [ticket.id]),
        detailOf(ticket, view, branchDeletedAt)
      ],
      { concurrency: "unbounded" }
    )
    return yield* withMissingAttachments(orgSlug, {
      ...detail,
      body,
      subTicketCount: entries[0]?.subTicketCount ?? 0,
      subTicketDoneCount: entries[0]?.subTicketDoneCount ?? 0
    })
  })

  const movedTo = Effect.fn("TicketQueries.movedTo")(function* (id: string) {
    const scope = yield* ProjectScope
    const found = yield* ticketIndex.movedTo(scope, id)
    if (found === null) return yield* new NotFound()
    const destination = yield* access.project(scope.orgSlug, found.projectSlug)
    if (!destination.permissions.can({ ticket: ["read"] })) {
      return yield* new NotFound()
    }
    return decodeMovedTicketLocation({
      projectSlug: found.projectSlug,
      id: found.ticketId
    })
  })

  return TicketQueries.of({
    movedTo,
    mine,
    mineByProject,
    recent,
    sections,
    sprintSections,
    epicSections,
    parentSections,
    neighbors,
    list,
    count,
    search,
    titles,
    textSearch,
    listInGroup,
    tagUsageCounts,
    get
  })
})

export const layer = Layer.effect(TicketQueries, make)
