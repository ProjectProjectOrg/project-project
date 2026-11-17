import { TicketPolicy } from "@pp/access/policies"
import { Db } from "@pp/db"
import {
  DEFAULT_TICKET_SORT,
  type Forbidden,
  type GroupIdFilter,
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
  sprintState,
  type Ticket,
  type TicketCountQuery,
  type TicketCounts,
  type TicketDetail,
  TICKET_LIST_LIMIT,
  type TicketListPage,
  type TicketListQuery,
  type TicketPageQuery,
  type TicketSearchQuery,
  type TicketTextHit,
  type TicketTextSearchQuery,
  type TicketTitle,
  type User,
  UserId,
  isEpic
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
import * as ProjectDocs from "../projects/ProjectDocs"
import { readProjectDocument } from "../projects/readProjectDocument"
import * as SyncLog from "../sync/SyncLog"
import * as Users from "../users/Users"
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
    textSearch: (
      options: TicketTextSearchQuery
    ) => Effect.Effect<
      ReadonlyArray<TicketTextHit>,
      Markdown.MarkdownError,
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
  const syncLog = yield* SyncLog.SyncLog
  const projectDocs = yield* ProjectDocs.ProjectDocs
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
      yield* readProjectDocument({
        db,
        syncLog,
        docs: projectDocs,
        project: scope
      })
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

  const hiddenGit: GitView = { integrations: [], visible: false }

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
    list,
    count,
    search,
    textSearch,
    tagUsageCounts,
    get
  })
})

export const layer = Layer.effect(TicketQueries, make)
