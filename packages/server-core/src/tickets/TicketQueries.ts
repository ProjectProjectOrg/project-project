import { TicketPolicy } from "@pp/access/policies"
import { Db } from "@pp/db"
import {
  CHILD_TICKET_SORT,
  DEFAULT_TICKET_SORT,
  EPIC_SECTION_NONE,
  type EpicSectionKey,
  estimationUnit,
  type Forbidden,
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
  RecentTicketActivity,
  type RecentTicketRow,
  sprintSectionKey,
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
  TicketListSource,
  type TicketSequence,
  type TicketSections,
  type TicketSort,
  type TicketSprintSections,
  type User,
  UserId,
  EPIC_TYPE,
  isEpic
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import * as Access from "../access/Access"
import { presentActor, storedActorUserId } from "../activity/actorRow"
import * as TicketBranchIndex from "../git/TicketBranchIndex"
import type * as GroupDocs from "../groups/GroupDocs"
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
) => {
  if (event === null) return null
  const actor = presentActor(event.actor, users)
  if (event.change.kind === "status_changed") {
    return actor === null
      ? null
      : ({
          at: event.occurredAt,
          activity: RecentTicketActivity.cases.status_changed.make({
            actor,
            at: event.occurredAt,
            from: event.change.from,
            to: event.change.to
          })
        } satisfies RecentCandidate)
  }
  return {
    at: event.occurredAt,
    activity:
      actor === null
        ? RecentTicketActivity.cases.assigned.make({ at: event.occurredAt })
        : RecentTicketActivity.cases.assigned.make({
            actor,
            at: event.occurredAt
          })
  } satisfies RecentCandidate
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
) {
  const candidates: ReadonlyArray<RecentCandidate | null> = [
    touchedEventCandidate(entry.statusEvent, users),
    touchedEventCandidate(entry.assignedEvent, users),
    entry.lastCommentAt === null
      ? null
      : {
          at: entry.lastCommentAt,
          activity: RecentTicketActivity.cases.commented.make({
            at: entry.lastCommentAt
          })
        },
    entry.entry.createdBy === viewerId
      ? {
          at: entry.entry.createdAt,
          activity: RecentTicketActivity.cases.created.make({
            at: entry.entry.createdAt
          })
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
  return latest?.activity ?? RecentTicketActivity.cases.assigned.make({})
}

const touchedActorIds = (
  entries: ReadonlyArray<TicketIndex.TicketIndexTouchedEntry>
) => [
  ...new Set(
    entries.flatMap(({ assignedEvent, statusEvent }) =>
      [assignedEvent, statusEvent].flatMap((event) => {
        const id = event === null ? null : storedActorUserId(event.actor)
        return id === null ? [] : [id]
      })
    )
  )
]

function ticketPage(
  entries: ReadonlyArray<TicketIndex.TicketIndexQueryEntry>,
  query: TicketListQuery,
  view: GitView,
  limit: number
) {
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
    sequence: (
      ticketId: string,
      source: TicketListSource | undefined
    ) => Effect.Effect<
      TicketSequence | null,
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

  const openSprintIds = (documents: ReadonlyArray<GroupDocs.GroupDocument>) =>
    documents.flatMap((group) =>
      group.kind === "sprint" && group.completedAt === null ? [group.id] : []
    )

  const groupMembers = (
    documents: ReadonlyArray<GroupDocs.GroupDocument>,
    groupIds: ReadonlyArray<GroupIdFilter>
  ) => {
    const selected = documents.filter((group) => groupIds.includes(group.id))
    return {
      sprints: selected.flatMap((group) =>
        group.kind === "sprint" ? [group.id] : []
      ),
      tickets: selected.flatMap((group) =>
        group.kind === "sprint" ? [] : group.tickets
      ),
      outsideSprints: groupIds.includes("ungrouped")
        ? openSprintIds(documents)
        : null
    }
  }

  const resolveGroupMembers = (
    groupIds: ReadonlyArray<GroupIdFilter> | undefined
  ) =>
    groupIds === undefined || groupIds.length === 0
      ? Effect.succeed(undefined)
      : Effect.map(groups.documents(), (documents) =>
          groupMembers(documents, groupIds)
        )

  const list = Effect.fn("TicketQueries.list")(function* (
    query: TicketPageQuery,
    limit?: number
  ) {
    const scope = yield* queryable(query)
    const { userId } = scope
    const [members, sectionMembers] = yield* Effect.all(
      [
        resolveGroupMembers(query.groupId),
        resolveGroupMembers(query.section?.groupId)
      ],
      { concurrency: 2 }
    )
    const pageLimit = limit ?? TICKET_LIST_LIMIT
    const [queryEntries, view] = yield* Effect.all(
      [
        ticketIndex.query(scope, query, {
          viewerId: userId,
          members,
          sectionMembers,
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

  const gitViewsFor = (scopes: ReadonlyArray<ProjectScope["Service"]>) =>
    Effect.forEach(
      scopes,
      (scope) =>
        gitViewOf(scope).pipe(
          Effect.map((view) => [scope.projectId, view] as const)
        ),
      { concurrency: 8 }
    ).pipe(Effect.map((views) => new Map(views)))

  const hiddenGit: GitView = { integrations: [], visible: false }

  const orgTicketRows = (
    scopeOf: ReadonlyMap<string, ProjectScope["Service"]>,
    entries: ReadonlyArray<TicketIndex.TicketIndexOrgEntry>
  ) =>
    Effect.gen(function* () {
      const projectIds = new Set(
        entries.map(({ project }) => project.projectId)
      )
      const views = yield* gitViewsFor(
        [...scopeOf.values()].filter((scope) => projectIds.has(scope.projectId))
      )
      return entries.map(
        ({ project, entry }) =>
          ({
            projectSlug: project.slug,
            ticket: indexEntryToTicket(
              entry,
              views.get(project.projectId) ?? hiddenGit
            )
          }) satisfies OrgTicketRow
      )
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
    return previews.map(({ project, total, entries }) => ({
      projectSlug: project.slug,
      total,
      tickets: entries.map((entry) =>
        indexEntryToTicket(entry, views.get(project.projectId) ?? hiddenGit)
      )
    }))
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
    return rows.map((row, index) => ({
      ...row,
      activity: recentActivityOf(entries[index], viewerId, actorsById)
    }))
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
                leavesOnly: !isEpic(attachParent)
              },
        limit
      }
    )
    return queryEntries.map(({ entry }) => indexEntryToTicket(entry, view))
  })

  const titles = Effect.fn("TicketQueries.titles")(function* () {
    const scope = yield* ProjectScope
    const entries = yield* ticketIndex.list(scope)
    return entries.flatMap((entry) =>
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
    return top.flatMap<TicketTextHit>(({ id, title, match }) => {
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
    const members = yield* resolveGroupMembers(query.groupId)
    const queryForCount: TicketCountQuery = {
      ...query,
      status: undefined
    }
    const counts = yield* ticketIndex.count(scope, queryForCount, {
      viewerId: userId,
      members
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
    const members = yield* resolveGroupMembers(query.groupId)
    const options = { viewerId: userId, members }
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
    query: TicketListQuery
  ) {
    const documents = yield* groups.documents()
    const now = yield* DateTime.nowAsDate
    const sections = backlogSprintSections(
      documents.filter((group) => group.kind === "sprint"),
      query.groupId,
      now
    )
    const unscheduled = query.groupId?.includes("ungrouped")
      ? {
          sprints: [],
          tickets: [],
          outsideSprints: [
            ...new Set([
              ...openSprintIds(documents),
              ...sections.flatMap((sprint) =>
                sprint === null ? [] : [sprint.id]
              )
            ])
          ]
        }
      : undefined
    return sections.map(
      (sprint) =>
        (sprint === null
          ? { key: "ungrouped", members: unscheduled }
          : {
              key: sprint.id,
              members: {
                sprints: [sprint.id],
                tickets: [],
                outsideSprints: null
              }
            }) satisfies TicketIndex.TicketIndexSection & { key: GroupIdFilter }
    )
  })

  const sprintSections = Effect.fn("TicketQueries.sprintSections")(function* (
    query: TicketListQuery
  ) {
    const scope = yield* queryable(query)
    const { userId } = scope
    const [members, projectDocument, view] = yield* Effect.all(
      [
        sprintSectionMembers(query),
        readProjectDocument({ db, docs: projectDocs, project: scope }),
        gitView
      ],
      { concurrency: "unbounded" }
    )
    const unit = estimationUnit(projectDocument.estimation)
    const estimatedSprints =
      unit === null
        ? []
        : members.flatMap(({ key }) => (key === "ungrouped" ? [] : [key]))
    const [bySection, sprintTickets, phaseOf] = yield* Effect.all(
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
        ticketIndex.sprintTickets(scope, estimatedSprints),
        unit === null
          ? Effect.succeed(null)
          : finishedStatuses.phasesForProject(scope.orgSlug, scope.slug)
      ],
      { concurrency: "unbounded" }
    )
    const estimatedBySprint = new Map<
      string,
      Array<TicketIndex.TicketIndexSprintTicket>
    >()
    for (const ticket of sprintTickets) {
      if (ticket.archived) continue
      const tickets = estimatedBySprint.get(ticket.sprintId) ?? []
      tickets.push(ticket)
      estimatedBySprint.set(ticket.sprintId, tickets)
    }
    const emptyCounts = { total: 0, byStatus: {} as Record<string, number> }
    const pages = members.map(({ key: groupId }) => {
      const result = bySection.get(groupId)
      const counts = result?.counts ?? emptyCounts
      const estimates =
        unit === null || phaseOf === null || groupId === "ungrouped"
          ? null
          : summarizeEstimates(
              estimatedBySprint.get(groupId) ?? [],
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

  const parentSectionQuery = (query: TicketListQuery) => ({
    ...query,
    type: query.type?.length ? query.type : undefined,
    excludeType: [...(query.excludeType ?? []), EPIC_TYPE],
    parent: undefined,
    groupId: undefined,
    cursor: undefined
  })

  const parentSectionsOf = Effect.fn("TicketQueries.parentSectionsOf")(
    function* (
      scope: Effect.Success<ReturnType<typeof queryable>>,
      query: TicketListQuery,
      sections: "parent" | "ticketParent",
      members: TicketIndex.TicketIndexMembers | undefined
    ) {
      return yield* ticketIndex.querySections(
        scope,
        parentSectionQuery(query),
        {
          viewerId: scope.userId,
          members,
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
  ) => {
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

  const byTitle = (entries: ReadonlyArray<TicketIndex.TicketIndexQueryEntry>) =>
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
          { type: [EPIC_TYPE], sort: EPIC_SECTION_SORT },
          epicOptions
        ),
        ticketIndex.query(
          scope,
          { type: [EPIC_TYPE], archived: true, sort: EPIC_SECTION_SORT },
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
    const [members, { wanted, archivedIds }, view] = yield* Effect.all(
      [resolveGroupMembers(query.groupId), epicSectionsWanted(scope), gitView],
      { concurrency: "unbounded" }
    )
    const bySection = yield* parentSectionsOf(scope, query, "parent", members)
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
    const [members, view] = yield* Effect.all(
      [resolveGroupMembers(query.groupId), gitView],
      { concurrency: "unbounded" }
    )
    const bySection = yield* parentSectionsOf(
      scope,
      query,
      "ticketParent",
      members
    )
    return toParentSections(
      yield* parentSectionsWanted(scope, bySection),
      bySection,
      query,
      view,
      (section) => section.count > 0 || section.key === EPIC_SECTION_NONE
    )
  })

  const viewSequence = Effect.fn("TicketQueries.viewSequence")(function* (
    source: TicketListSource
  ) {
    const scope = yield* queryable(source.query)
    const query = { ...source.query, cursor: undefined }
    const find = (
      ticketQuery: TicketListQuery,
      options: Omit<TicketIndex.TicketIndexSequenceOptions, "viewerId">
    ) =>
      ticketIndex.sequence(scope, ticketQuery, {
        ...options,
        viewerId: scope.userId
      })
    if (TicketListSource.isAnyOf(["sprintBoard"])(source)) {
      const documents = yield* groups.documents()
      if (!documents.some((group) => group.id === source.groupId)) {
        return yield* new NotFound()
      }
      return yield* find(
        {
          ...query,
          groupId: undefined,
          archived: undefined,
          subTickets: "nested"
        },
        {
          members: groupMembers(documents, [source.groupId]),
          sections: TicketIndex.TicketIndexSectionOrder.status(),
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
        const members = yield* resolveGroupMembers(query.groupId)
        return yield* find(query, {
          members,
          sections: TicketIndex.TicketIndexSectionOrder.status(),
          within
        })
      }
      case "sprint": {
        const members = yield* sprintSectionMembers(query)
        return yield* find(
          { ...query, groupId: undefined },
          {
            sections: TicketIndex.TicketIndexSectionOrder.explicit({
              sections: members
            }),
            within
          }
        )
      }
      case "epic": {
        const [members, { wanted }] = yield* Effect.all(
          [resolveGroupMembers(query.groupId), epicSectionsWanted(scope)],
          { concurrency: "unbounded" }
        )
        return yield* find(parentSectionQuery(query), {
          members,
          sections: TicketIndex.TicketIndexSectionOrder.parent({
            keys: wanted.map(({ key }) => key)
          }),
          within
        })
      }
      case "parent": {
        const members = yield* resolveGroupMembers(query.groupId)
        const wanted = yield* parentSectionsWanted(
          scope,
          yield* parentSectionsOf(scope, query, "ticketParent", members)
        )
        return yield* find(parentSectionQuery(query), {
          members,
          sections: TicketIndex.TicketIndexSectionOrder.ticketParent({
            keys: wanted.map(({ key }) => key)
          }),
          within
        })
      }
    }
  })

  const childSequence = Effect.fn("TicketQueries.childSequence")(function* (
    ticketId: string
  ) {
    const [entry] = yield* ticketIndex.list(yield* ProjectScope, [ticketId])
    const parent = entry?.parent ?? null
    if (parent === null) return null
    const query = { parent: [parent.id], sort: CHILD_TICKET_SORT }
    const scope = yield* queryable(query)
    const tickets = yield* ticketIndex.sequence(scope, query, {
      viewerId: scope.userId,
      sections: TicketIndex.TicketIndexSectionOrder.explicit({
        sections: [{ key: parent.id }]
      }),
      within: { sort: CHILD_TICKET_SORT }
    })
    return {
      within: isEpic(parent) ? "epic" : "parent",
      tickets
    } satisfies TicketSequence
  })

  const sequence = Effect.fn("TicketQueries.sequence")(function* (
    ticketId: string,
    source: TicketListSource | undefined
  ) {
    if (source !== undefined) {
      const tickets = yield* viewSequence(source)
      if (tickets.some((ticket) => ticket.id === ticketId)) {
        return { within: "view", tickets } satisfies TicketSequence
      }
    }
    return yield* childSequence(ticketId)
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
    sequence,
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
