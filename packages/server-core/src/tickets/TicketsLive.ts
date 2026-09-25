import { GroupPolicy, TicketPolicy } from "@pp/access/policies"
import { Db } from "@pp/db"
import {
  BranchNotFound,
  Conflict,
  DEFAULT_TICKET_SORT,
  GitStatesResponse,
  MentionInvalid,
  MY_TICKETS_DONE_WINDOW_DAYS,
  MY_TICKETS_PAGE_SIZE,
  MY_TICKETS_PER_PROJECT,
  NotFound,
  paginateSorted,
  RECENT_TICKETS_LIMIT,
  Forbidden,
  formatMentionHref,
  TagName,
  Ticket,
  TICKET_LIST_LIMIT,
  TicketDetail,
  extractAttachmentRefs,
  TicketId,
  UserId,
  normalizeLineEndings,
  Validation,
  type ProjectKey,
  type GroupId,
  type GroupIdFilter,
  type MyTicketsQuery,
  type OrgTicketPage,
  type OrgTicketRow,
  type ProjectTicketsPreview,
  type RecentTicketActivity,
  type RecentTicketRow,
  type SplitTicketResultInput,
  type TicketCountQuery,
  type TicketListPage,
  type TicketListQuery,
  type TemplateKey,
  TicketStatus,
  type User,
  sprintSectionKey,
  sprintState,
  OrgScope,
  ProjectScope,
  type ProjectScopeShape
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { Access } from "../access/Access"
import { Attachments } from "../attachments/Attachments"
import { validateBodyMentionsWithLookups } from "../comments/BodyMentions"
import { Comments } from "../comments/Comments"
import { FigmaLinks } from "../figma/FigmaLinks"
import * as GitHub from "../github/GitHub"
import { Groups } from "../groups/Groups"
import { Library, type TemplateExpansion } from "../library/Library"
import type { MarkdownError } from "../markdown/Markdown"
import { Projects } from "../projects/Projects"
import type { ProjectGithubIntegration } from "../projects/Projects"
import { Users } from "../users/Users"
import {
  MalformedTicketDocument,
  TicketDocs,
  type TicketDocument
} from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import {
  planAutomaticBranchLinks,
  planTicketGitStates
} from "./ticketGitStatePlanner"
import {
  TicketIndex,
  type TicketIndexEntry,
  type TicketIndexOrgEntry,
  type TicketIndexTouchedEntry,
  type TicketIndexQueryEntry,
  type TicketIndexProject
} from "./TicketIndex"
import { Tickets, type TicketsShape } from "./Tickets"

const makeTicketId = Schema.decodeUnknownSync(TicketId)
const makeUserId = Schema.decodeUnknownSync(UserId)
const makeTagName = Schema.decodeUnknownSync(TagName)
const DEFAULT_STATUS = Schema.decodeSync(TicketStatus)("todo")

type TicketReadError = NotFound | MarkdownError | MalformedTicketDocument

type GitView = Readonly<{
  integration: ProjectGithubIntegration | null
  visible: boolean
}>

const withoutGit = <T extends Ticket>(ticket: T): T => ({
  ...ticket,
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  gitState: { tag: "no_branch" }
})

const presentTicket = <T extends Ticket>(view: GitView, ticket: T): T =>
  view.visible ? ticket : withoutGit(ticket)

function pendingGitState(
  document: Pick<TicketDocument, "branch" | "pr" | "prState">,
  github: ProjectGithubIntegration | null,
  branchDeletedAt: Date | null = null
): Ticket["gitState"] {
  const baseBranch = github?.defaultBaseBranch ?? "main"
  if (!document.branch) return { tag: "no_branch", baseBranch }
  if (document.pr !== null) {
    const url = github
      ? `https://github.com/${github.repoOwner}/${github.repoName}/pull/${document.pr}`
      : ""
    if (document.prState === "merged") {
      return {
        tag: "pr_merged",
        branch: document.branch,
        baseBranch,
        number: document.pr,
        url,
        title: "",
        mergedAt: null
      }
    }
    if (document.prState === "closed") {
      return {
        tag: "pr_closed",
        branch: document.branch,
        baseBranch,
        number: document.pr,
        url,
        title: ""
      }
    }
    return {
      tag: "pr_pending",
      branch: document.branch,
      baseBranch,
      number: document.pr,
      url
    }
  }
  if (branchDeletedAt !== null) {
    return { tag: "stale_branch", name: document.branch }
  }
  return { tag: "branch_pending", name: document.branch, baseBranch }
}

function documentToTicket(
  document: TicketDocument,
  view: GitView,
  branchDeletedAt: Date | null = null
): Ticket {
  const { body: _body, commentsRegion: _commentsRegion, ...ticket } = document
  return presentTicket(view, {
    ...ticket,
    gitState: pendingGitState(document, view.integration, branchDeletedAt)
  })
}

function indexEntryToTicket(entry: TicketIndexEntry, view: GitView): Ticket {
  const { branchDeletedAt: _branchDeletedAt, ...ticket } = entry
  return presentTicket(view, {
    ...ticket,
    gitState: pendingGitState(entry, view.integration, entry.branchDeletedAt)
  })
}

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

function documentToDetail(
  document: TicketDocument,
  view: GitView,
  creator: User | null,
  updater: User | null,
  branchDeletedAt: Date | null = null
): TicketDetail {
  return {
    ...documentToTicket(document, view, branchDeletedAt),
    splitFrom: document.splitFrom ?? null,
    creator,
    updater,
    body: document.body
  }
}

const indexProjectOf = (scope: ProjectScopeShape): TicketIndexProject => ({
  orgSlug: scope.orgSlug,
  organizationId: scope.organizationId,
  projectId: scope.projectId,
  projectSlug: scope.slug
})

const requirePolicy = (
  allowed: (scope: ProjectScopeShape) => boolean
): Effect.Effect<void, Forbidden, ProjectScope> =>
  Effect.flatMap(ProjectScope, (scope) =>
    allowed(scope) ? Effect.void : Effect.fail(new Forbidden())
  )

const requireTicketChange = (change: TicketPolicy.Change) =>
  requirePolicy((scope) => TicketPolicy.canChange(scope, change))

const requireSplit = (
  source: TicketDocument,
  retained: SplitTicketResultInput,
  created: ReadonlyArray<SplitTicketResultInput>
) =>
  requirePolicy((scope) =>
    TicketPolicy.canSplit(scope, {
      ownerId: source.createdBy,
      source,
      retained,
      created,
      defaultStatus: DEFAULT_STATUS
    })
  )

const changed = <A>(next: A | undefined, current: A) =>
  next !== undefined && next !== current

const listChanged = (
  next: ReadonlyArray<string> | undefined,
  current: ReadonlyArray<string>
) =>
  next !== undefined &&
  (next.length !== current.length ||
    next.some((value, index) => value !== current[index]))

export const TicketsLive = Layer.effect(
  Tickets,
  Effect.gen(function* () {
    const ticketDocs = yield* TicketDocs
    const { withTicketDocumentLock, withRepositoryBranchLock } =
      yield* TicketDocumentLock.TicketDocumentLock
    const projects = yield* Projects
    const ticketIndex = yield* TicketIndex
    const github = yield* GitHub.GitHub
    const groups = yield* Groups
    const comments = yield* Comments
    const db = yield* Db
    const attachments = yield* Attachments
    const figmaLinks = yield* FigmaLinks
    const users = yield* Users
    const library = yield* Library
    const access = yield* Access

    const gitViewOf = (scope: ProjectScopeShape): Effect.Effect<GitView> =>
      scope.permissions.can({ github: ["read"] })
        ? projects.githubIntegration().pipe(
            Effect.provideService(ProjectScope, scope),
            Effect.map((integration) => ({ integration, visible: true }))
          )
        : Effect.succeed({ integration: null, visible: false })

    const gitView = Effect.flatMap(ProjectScope, gitViewOf)

    const queryable = (query: TicketPolicy.Query) =>
      requirePolicy((scope) => TicketPolicy.canQuery(scope, query)).pipe(
        Effect.andThen(ProjectScope)
      )

    const detailOf = (
      document: TicketDocument,
      view: GitView,
      branchDeletedAt: Date | null = null
    ): Effect.Effect<TicketDetail> =>
      users
        .fullByIds([...new Set([document.createdBy, document.updatedBy])])
        .pipe(
          Effect.map((found) => {
            const byId = new Map<string, User>(
              found.map((user) => [user.id, user])
            )
            return documentToDetail(
              document,
              view,
              byId.get(document.createdBy) ?? null,
              byId.get(document.updatedBy) ?? null,
              branchDeletedAt
            )
          })
        )

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

    const readTicket = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<
      TicketDocument,
      NotFound | MarkdownError | MalformedTicketDocument
    > => ticketDocs.read(orgSlug, slug, id)

    const list: TicketsShape["list"] = (query, limit) =>
      Effect.gen(function* () {
        const scope = yield* queryable(query)
        const { userId } = scope
        const project = indexProjectOf(scope)
        const groupMemberSet = yield* resolveGroupMembers(
          project,
          query.groupId
        )
        const pageLimit = limit ?? TICKET_LIST_LIMIT
        const queryEntries = yield* ticketIndex.query(project, query, {
          viewerId: userId,
          ticketIds: groupMemberSet === null ? undefined : [...groupMemberSet],
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
          [...scopeOf.values()].filter((scope) =>
            projectIds.has(scope.projectId)
          )
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

    const mine = Effect.fn("Tickets.mine")(function* (query: MyTicketsQuery) {
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

    const mineByProject = Effect.fn("Tickets.mineByProject")(function* () {
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

    const recent = Effect.fn("Tickets.recent")(function* () {
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
          activity: recentActivityOf(entries[index]!, viewerId)
        })
      )
    })

    const listInGroup: TicketsShape["listInGroup"] = (groupId) =>
      Effect.gen(function* () {
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

    const search: TicketsShape["search"] = (options) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { userId } = scope
        const project = indexProjectOf(scope)
        const excludedTicketIds = options.excludeGroupId
          ? (yield* groups
              .get(options.excludeGroupId)
              .pipe(
                Effect.catchTag("NotFound", () =>
                  Effect.succeed({ tickets: [] })
                )
              )).tickets
          : undefined
        const limit = Math.min(
          Math.max(1, options.limit ?? SEARCH_DEFAULT_LIMIT),
          SEARCH_MAX_LIMIT
        )
        const queryEntries = yield* ticketIndex.query(
          project,
          { q: options.q, sort: DEFAULT_TICKET_SORT },
          {
            viewerId: userId,
            excludeTicketIds: excludedTicketIds,
            limit
          }
        )
        const view = yield* gitView
        return queryEntries.map(({ entry }) => indexEntryToTicket(entry, view))
      })

    const tagUsageCounts: TicketsShape["tagUsageCounts"] = () =>
      Effect.flatMap(ProjectScope, (scope) =>
        ticketIndex.tagUsageCounts(indexProjectOf(scope))
      )

    const count: TicketsShape["count"] = (query) =>
      Effect.gen(function* () {
        const scope = yield* queryable(query)
        const { userId } = scope
        const project = indexProjectOf(scope)
        const groupMemberSet = yield* resolveGroupMembers(
          project,
          query.groupId
        )
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

    const sections = Effect.fn("Tickets.sections")(function* (
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
      const counts = yield* ticketIndex.count(
        project,
        {
          ...query,
          status: undefined
        },
        options
      )
      const view = yield* gitView
      const statuses = Object.keys(counts.byStatus).filter(
        (status) =>
          !query.status?.length ||
          query.status.some((requested) => requested === status)
      )
      const pages = yield* Effect.forEach(
        statuses,
        (status) =>
          ticketIndex
            .query(
              project,
              {
                ...query,
                status: [Schema.decodeSync(Ticket.fields.status)(status)],
                cursor: undefined
              },
              { ...options, limit: TICKET_LIST_LIMIT + 1 }
            )
            .pipe(
              Effect.map(
                (entries) =>
                  [
                    status,
                    ticketPage(entries, query, view, TICKET_LIST_LIMIT)
                  ] as const
              )
            ),
        { concurrency: 4 }
      )
      return { counts, sections: Object.fromEntries(pages) }
    })

    const sprintSections = Effect.fn("Tickets.sprintSections")(function* (
      query: TicketListQuery
    ) {
      const scope = yield* queryable(query)
      const { userId } = scope
      const project = indexProjectOf(scope)
      const sprints = (yield* groups.list()).filter(
        (group) => group.kind === "sprint"
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
      const claimedIds = [...claimed]
      const ungroupedMembers = query.groupId?.includes("ungrouped")
        ? yield* resolveGroupMembers(project, ["ungrouped"])
        : null
      const countQuery = { ...query, groupId: undefined, status: undefined }
      const pages = yield* Effect.forEach(
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
            const excludeTicketIds =
              groupId === "ungrouped" &&
              ungroupedMembers === null &&
              claimedIds.length > 0
                ? claimedIds
                : undefined
            const counts = yield* ticketIndex.count(project, countQuery, {
              viewerId: userId,
              ticketIds,
              excludeTicketIds
            })
            const entries = yield* ticketIndex.query(
              project,
              {
                ...query,
                groupId: undefined,
                cursor: undefined
              },
              {
                viewerId: userId,
                ticketIds,
                excludeTicketIds,
                limit: TICKET_LIST_LIMIT + 1
              }
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
                page: ticketPage(entries, query, view, TICKET_LIST_LIMIT)
              },
              counts
            }
          }),
        { concurrency: 4 }
      )
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

    const get: TicketsShape["get"] = (id) =>
      Effect.gen(function* () {
        const { orgSlug, slug } = yield* ProjectScope
        const view = yield* gitView
        const ticket = yield* readTicket(orgSlug, slug, id)
        const body = yield* library.resolveSynced(orgSlug, slug, ticket.body)
        const branchDeletedAt = yield* ticketIndex.getBranchDeletedAt(
          orgSlug,
          slug,
          id
        )
        return yield* withMissingAttachments(
          orgSlug,
          yield* detailOf({ ...ticket, body }, view, branchDeletedAt)
        )
      })

    const withMissingAttachments = (orgSlug: string, detail: TicketDetail) =>
      attachments
        .missingIds(
          orgSlug,
          extractAttachmentRefs(detail.body)
            .filter((ref) => ref.orgSlug === orgSlug)
            .map((ref) => ref.id)
        )
        .pipe(
          Effect.map((missingAttachments) => ({
            ...detail,
            missingAttachments
          }))
        )

    const validateTagsExist = (
      projectId: string,
      requested: ReadonlyArray<string>
    ): Effect.Effect<void, Validation> =>
      Effect.gen(function* () {
        if (requested.length === 0) return
        const rows = yield* db.query.projectTag
          .findMany({
            columns: { name: true },
            where: { projectId }
          })
          .pipe(Effect.orDie)
        const known = new Set<string>(rows.map((r) => r.name))
        const missing = requested.filter((name) => !known.has(name))
        if (missing.length > 0) {
          return yield* new Validation({
            reason: `unknown_tags:${missing.join(",")}`
          })
        }
      })

    const validateStatusExists = (
      projectId: string,
      requested: TicketStatus
    ): Effect.Effect<void, Validation> =>
      Effect.gen(function* () {
        const rows = yield* db.query.projectStatus
          .findMany({
            columns: { slug: true },
            where: { projectId }
          })
          .pipe(Effect.orDie)
        const known = new Set<string>(rows.map((r) => r.slug))
        if (!known.has(requested)) {
          return yield* new Validation({
            reason: `unknown_status:${requested}`
          })
        }
      })

    const validateBody = (
      body: string,
      indexProject: TicketIndexProject
    ): Effect.Effect<void, NotFound | MentionInvalid, ProjectScope> =>
      validateBodyMentionsWithLookups(body, {
        existingTicketIds: (ticketIds) =>
          ticketIndex.existingIds(indexProject, ticketIds),
        memberIds: () => projects.memberIds()
      })

    const validateAssigneesAreMembers = (
      assignees: ReadonlyArray<string>
    ): Effect.Effect<void, Validation, ProjectScope> =>
      Effect.gen(function* () {
        const members = yield* projects.memberIds()
        const invalid = assignees.filter((id) => !members.has(id))
        if (invalid.length > 0) {
          return yield* new Validation({
            reason: `non_member_assignees:${invalid.join(",")}`
          })
        }
      })

    const writeWithIdAllocation = (
      orgSlug: string,
      slug: string,
      projectKey: ProjectKey,
      indexProject: TicketIndexProject,
      buildDocument: (id: TicketId) => TicketDocument,
      onFileWritten?: (document: TicketDocument) => void
    ): Effect.Effect<TicketDocument, MarkdownError> =>
      Effect.gen(function* () {
        while (true) {
          const candidate = makeTicketId(
            `${projectKey}-${yield* ticketIndex.reserveTicketNumber(indexProject)}`
          )
          const document = buildDocument(candidate)
          const result = yield* ticketDocs
            .create(orgSlug, slug, document, (created) =>
              Effect.sync(() => onFileWritten?.(created)).pipe(
                Effect.andThen(
                  attachments.reconcileTicket(
                    orgSlug,
                    slug,
                    created.id,
                    created.body
                  )
                ),
                Effect.andThen(
                  figmaLinks.reconcileTicket(
                    orgSlug,
                    slug,
                    created.id,
                    created.title,
                    created.body
                  )
                ),
                Effect.andThen(ticketIndex.upsertTicket(indexProject, created))
              )
            )
            .pipe(
              Effect.map(() => "ok" as const),
              Effect.catchTag("TicketIdTaken", () =>
                Effect.succeed("retry" as const)
              )
            )
          if (result === "ok") return document
        }
      })

    const expansionFor = (
      orgSlug: string,
      slug: string,
      template: TemplateKey | null | undefined
    ): Effect.Effect<
      TemplateExpansion | null,
      NotFound | Validation | MarkdownError
    > =>
      template === undefined || template === null
        ? Effect.succeed(null)
        : library.expandForCreate(orgSlug, slug, template)

    const quickCreate: TicketsShape["quickCreate"] = (input) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug, userId: ownerId, projectId } = scope
        yield* requireTicketChange({
          ownerId,
          content: false,
          status: input.status !== undefined && input.status !== DEFAULT_STATUS,
          assignees: false
        })
        if (input.status !== undefined) {
          yield* validateStatusExists(projectId, input.status)
        }
        const expansion = yield* expansionFor(orgSlug, slug, input.template)
        const tags = expansion?.tags ?? []
        const body = expansion?.body ?? ""
        yield* validateTagsExist(projectId, tags)
        const indexProject = indexProjectOf(scope)
        if (body !== "") {
          yield* validateBody(body, indexProject)
        }
        const projectKey = yield* projects.key()
        const now = yield* DateTime.nowAsDate
        const document = yield* writeWithIdAllocation(
          orgSlug,
          slug,
          projectKey,
          indexProject,
          (id) => ({
            id,
            title: input.title,
            status: input.status ?? DEFAULT_STATUS,
            type: input.type ?? expansion?.type ?? "other",
            priority: expansion?.priority ?? "med",
            tags: [...tags],
            branch: null,
            pr: null,
            prState: null,
            lastTransitionedPr: null,
            assignees: [],
            archivedAt: null,
            createdBy: ownerId,
            createdAt: now,
            updatedBy: ownerId,
            updatedAt: now,
            body,
            commentsRegion: ""
          })
        )
        return yield* detailOf(document, yield* gitView)
      })

    const create: TicketsShape["create"] = (input) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug, userId: ownerId, projectId } = scope
        yield* requireTicketChange({
          ownerId,
          content: false,
          status: input.status !== undefined && input.status !== DEFAULT_STATUS,
          assignees: (input.assignees ?? []).length > 0
        })
        const expansion = yield* expansionFor(orgSlug, slug, input.template)
        const indexProject = indexProjectOf(scope)
        const projectKey = yield* projects.key()
        const tags = input.tags ?? expansion?.tags ?? []
        yield* validateTagsExist(projectId, tags)
        if (input.assignees !== undefined && input.assignees.length > 0) {
          yield* validateAssigneesAreMembers(input.assignees)
        }
        const body = yield* library.resolveSynced(
          orgSlug,
          slug,
          normalizeLineEndings(input.body ?? expansion?.body ?? "")
        )
        if (body !== "") {
          yield* validateBody(body, indexProject)
        }
        const now = yield* DateTime.nowAsDate
        const document = yield* writeWithIdAllocation(
          orgSlug,
          slug,
          projectKey,
          indexProject,
          (id) => ({
            id,
            title: input.title,
            status: input.status ?? DEFAULT_STATUS,
            type: input.type ?? expansion?.type ?? "other",
            priority: input.priority ?? expansion?.priority ?? "med",
            tags: [...tags],
            branch: null,
            pr: null,
            prState: null,
            lastTransitionedPr: null,
            assignees:
              input.assignees !== undefined ? [...input.assignees] : [],
            archivedAt: null,
            createdBy: ownerId,
            createdAt: now,
            updatedBy: ownerId,
            updatedAt: now,
            body,
            commentsRegion: ""
          })
        )
        return yield* detailOf(document, yield* gitView)
      })

    const update: TicketsShape["update"] = (id, input, sort, expectedBody) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug, userId, projectId } = scope
        return yield* withTicketDocumentLock(
          orgSlug,
          slug,
          id,
          Effect.gen(function* () {
            const view = yield* gitView
            const indexProject = indexProjectOf(scope)

            if (input.tags !== undefined) {
              yield* validateTagsExist(projectId, input.tags)
            }

            const body =
              input.body === undefined
                ? undefined
                : yield* library.resolveSynced(
                    orgSlug,
                    slug,
                    normalizeLineEndings(input.body)
                  )

            if (body !== undefined) {
              yield* validateBody(body, indexProject)
            }

            const next = yield* ticketDocs.update(
              orgSlug,
              slug,
              id,
              (existing) =>
                Effect.gen(function* () {
                  if (
                    expectedBody !== undefined &&
                    existing.body !== expectedBody
                  ) {
                    return yield* new Validation({
                      reason: "ticket_body_changed"
                    })
                  }
                  const content =
                    changed(input.title, existing.title) ||
                    changed(input.type, existing.type) ||
                    changed(input.priority, existing.priority) ||
                    changed(body, existing.body) ||
                    listChanged(input.tags, existing.tags)
                  const status = changed(input.status, existing.status)
                  const assignees = listChanged(
                    input.assignees,
                    existing.assignees
                  )
                  yield* requireTicketChange({
                    ownerId: existing.createdBy,
                    content: content || (!status && !assignees),
                    status,
                    assignees
                  })
                  if (input.assignees !== undefined) {
                    const existingSet = new Set(existing.assignees)
                    const newcomers = input.assignees.filter(
                      (assigneeId) => !existingSet.has(assigneeId)
                    )
                    if (newcomers.length > 0) {
                      yield* validateAssigneesAreMembers(newcomers)
                    }
                  }
                  return {
                    ...existing,
                    title: input.title ?? existing.title,
                    status: input.status ?? existing.status,
                    type: input.type ?? existing.type,
                    priority: input.priority ?? existing.priority,
                    tags:
                      input.tags !== undefined
                        ? [...input.tags]
                        : existing.tags,
                    assignees:
                      input.assignees !== undefined
                        ? input.assignees
                        : existing.assignees,
                    updatedBy: userId,
                    updatedAt: yield* DateTime.nowAsDate,
                    body: body ?? existing.body
                  }
                }),
              (next) =>
                (input.body === undefined
                  ? Effect.void
                  : attachments
                      .reconcileTicket(orgSlug, slug, id, next.body)
                      .pipe(
                        Effect.andThen(
                          figmaLinks.reconcileTicket(
                            orgSlug,
                            slug,
                            id,
                            next.title,
                            next.body
                          )
                        )
                      )
                ).pipe(
                  Effect.andThen(ticketIndex.upsertTicket(indexProject, next))
                )
            )

            const ticket = yield* withMissingAttachments(
              orgSlug,
              yield* detailOf(next, view)
            )
            const orderKey =
              sort === undefined
                ? null
                : yield* ticketIndex.orderKeyFor(indexProject, id, sort)
            return { ticket, orderKey }
          })
        )
      })

    const discardSplitResult = (
      orgSlug: string,
      slug: string,
      indexProject: TicketIndexProject,
      document: TicketDocument
    ) =>
      ticketDocs
        .remove(
          orgSlug,
          slug,
          document.id,
          attachments
            .reconcileTicket(orgSlug, slug, document.id, "")
            .pipe(
              Effect.andThen(
                figmaLinks.reconcileTicket(orgSlug, slug, document.id, "", "")
              ),
              Effect.andThen(
                ticketIndex.deleteTicket(indexProject, document.id)
              )
            )
        )
        .pipe(Effect.ignore)

    const restoreSplitDocuments = (
      orgSlug: string,
      slug: string,
      id: string,
      indexProject: TicketIndexProject,
      original: TicketDocument,
      created: ReadonlyArray<TicketDocument>
    ) =>
      Effect.forEach(
        created,
        (document) => discardSplitResult(orgSlug, slug, indexProject, document),
        { discard: true }
      ).pipe(
        Effect.andThen(
          ticketDocs
            .write(orgSlug, slug, id, original)
            .pipe(
              Effect.andThen(ticketIndex.upsertTicket(indexProject, original))
            )
        )
      )

    const split: TicketsShape["split"] = (id, input) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug, userId, projectId } = scope
        const [retainedInput, ...newInputs] = input.results
        if (retainedInput === undefined || newInputs.length === 0) {
          return yield* new Validation({ reason: "split_needs_two_results" })
        }

        const indexProject = indexProjectOf(scope)
        const projectKey = yield* projects.key()
        const view = yield* gitView
        yield* requireSplit(
          yield* readTicket(orgSlug, slug, id),
          retainedInput,
          newInputs
        )

        const assignees = [
          ...new Set(input.results.flatMap((result) => result.assignees))
        ]
        if (assignees.length > 0) {
          yield* validateAssigneesAreMembers(assignees)
        }
        yield* Effect.forEach(
          [...new Set(input.results.map((result) => result.status))],
          (status) => validateStatusExists(projectId, status),
          { discard: true }
        )

        const originalId = makeTicketId(id)
        const originalSprint = (yield* groups.list()).find(
          (group) =>
            group.kind === "sprint" &&
            group.completedAt === null &&
            group.tickets.includes(originalId)
        )
        const originalSprintId = originalSprint?.id ?? null
        const retainedMoves = retainedInput.sprintId !== originalSprintId
        if (
          retainedMoves ||
          newInputs.some((result) => result.sprintId !== null)
        ) {
          yield* requirePolicy((scope) =>
            GroupPolicy.canManage(scope, "sprint")
          )
        }
        const sprintTargets = [
          retainedMoves ? retainedInput.sprintId : null,
          ...newInputs.map((result) => result.sprintId)
        ].filter((sprintId) => sprintId !== null)
        if (sprintTargets.length > 0) {
          yield* groups.ensureSprintAssignable(sprintTargets)
        }
        const originalSprintIndex =
          originalSprint?.tickets.indexOf(originalId) ?? -1
        const originalSprintAnchor = originalSprint
          ? originalSprintIndex === 0
            ? null
            : originalSprint.tickets[originalSprintIndex - 1]
          : undefined

        const written = yield* withTicketDocumentLock(
          orgSlug,
          slug,
          id,
          Effect.gen(function* () {
            const original = yield* ticketDocs.read(orgSlug, slug, id)
            yield* requireSplit(original, retainedInput, newInputs)
            const now = yield* DateTime.nowAsDate
            const persisted: Array<TicketDocument> = []

            const run = Effect.gen(function* () {
              const createdDocuments: Array<TicketDocument> = []
              for (const result of newInputs) {
                createdDocuments.push(
                  yield* writeWithIdAllocation(
                    orgSlug,
                    slug,
                    projectKey,
                    indexProject,
                    (newId) => ({
                      id: newId,
                      title: result.title,
                      status: result.status,
                      type: result.type,
                      priority: result.priority,
                      tags: original.tags,
                      branch: null,
                      branchAutoLinkDisabled: true,
                      pr: null,
                      prState: null,
                      lastTransitionedPr: null,
                      splitFrom: originalId,
                      assignees: [...result.assignees],
                      archivedAt: original.archivedAt,
                      createdBy: userId,
                      createdAt: now,
                      updatedBy: userId,
                      updatedAt: now,
                      body: `Split from [${originalId}](${formatMentionHref("ticket", originalId)})
`,
                      commentsRegion: ""
                    }),
                    (document) => persisted.push(document)
                  )
                )
              }

              const retained = yield* ticketDocs.update(
                orgSlug,
                slug,
                id,
                (existing) =>
                  Effect.succeed({
                    ...existing,
                    title: retainedInput.title,
                    type: retainedInput.type,
                    status: retainedInput.status,
                    priority: retainedInput.priority,
                    assignees: [...retainedInput.assignees],
                    updatedBy: userId,
                    updatedAt: now
                  }),
                (next) => ticketIndex.upsertTicket(indexProject, next)
              )

              return { original, retained, createdDocuments }
            })

            return yield* run.pipe(
              Effect.onError(() =>
                restoreSplitDocuments(
                  orgSlug,
                  slug,
                  id,
                  indexProject,
                  original,
                  persisted
                ).pipe(Effect.ignoreCause)
              )
            )
          })
        )

        let sprintAnchor = originalId
        const sprintAssignments = [
          { ticketId: originalId, sprintId: retainedInput.sprintId },
          ...written.createdDocuments.map((document, index) => ({
            ticketId: document.id,
            sprintId: newInputs[index].sprintId
          }))
        ]
        yield* Effect.forEach(
          sprintAssignments,
          ({ ticketId, sprintId }) =>
            groups
              .setSprintMembership(orgSlug, slug, ticketId, sprintId, {
                after: sprintAnchor
              })
              .pipe(
                Effect.tap(() =>
                  Effect.sync(() => {
                    sprintAnchor = ticketId
                  })
                )
              ),
          { discard: true }
        ).pipe(
          Effect.onError(() =>
            Effect.forEach(
              written.createdDocuments,
              (document) =>
                groups
                  .setSprintMembership(orgSlug, slug, document.id, null)
                  .pipe(
                    Effect.catchCause((cause) =>
                      Effect.logError("split: sprint rollback failed", cause)
                    )
                  ),
              { discard: true }
            ).pipe(
              Effect.andThen(
                groups
                  .setSprintMembership(
                    orgSlug,
                    slug,
                    originalId,
                    originalSprintId,
                    { after: originalSprintAnchor }
                  )
                  .pipe(
                    Effect.catchCause((cause) =>
                      Effect.logError("split: sprint rollback failed", cause)
                    )
                  )
              ),
              Effect.andThen(
                restoreSplitDocuments(
                  orgSlug,
                  slug,
                  id,
                  indexProject,
                  written.original,
                  written.createdDocuments
                ).pipe(
                  Effect.catchCause((cause) =>
                    Effect.logError("split: ticket rollback failed", cause)
                  )
                )
              )
            )
          )
        )

        return {
          retained: yield* detailOf(written.retained, view),
          created: yield* Effect.forEach(written.createdDocuments, (document) =>
            detailOf(document, view)
          )
        }
      })

    const remove: TicketsShape["remove"] = (id) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug } = scope
        const indexProject = indexProjectOf(scope)
        yield* groups.removeTicketFromAllGroups(orgSlug, slug, id)
        yield* withTicketDocumentLock(
          orgSlug,
          slug,
          id,
          ticketDocs.remove(
            orgSlug,
            slug,
            id,
            attachments
              .reconcileTicket(orgSlug, slug, id, "")
              .pipe(
                Effect.andThen(
                  figmaLinks.reconcileTicket(orgSlug, slug, id, "", "")
                ),
                Effect.andThen(ticketIndex.deleteTicket(indexProject, id))
              )
          )
        )
      })

    const requireArchivable = (orgSlug: string, slug: string, id: string) =>
      readTicket(orgSlug, slug, id).pipe(
        Effect.flatMap((ticket) =>
          requireTicketChange({
            ownerId: ticket.createdBy,
            content: true,
            status: false,
            assignees: false
          })
        )
      )

    const archive: TicketsShape["archive"] = (id, reason) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug } = scope
        return yield* withTicketDocumentLock(
          orgSlug,
          slug,
          id,
          Effect.gen(function* () {
            yield* requireArchivable(orgSlug, slug, id)
            const indexProject = indexProjectOf(scope)
            const trimmed = reason?.trim()
            if (trimmed !== undefined && trimmed.length > 0) {
              yield* comments
                .create(makeTicketId(id), { body: trimmed })
                .pipe(Effect.asVoid)
            }
            const next = yield* ticketDocs.update(
              orgSlug,
              slug,
              id,
              (existing) =>
                DateTime.nowAsDate.pipe(
                  Effect.map((now) => ({
                    ...existing,
                    archivedAt: existing.archivedAt ?? now,
                    updatedAt: now
                  }))
                ),
              (next) => ticketIndex.upsertTicket(indexProject, next)
            )
            return yield* detailOf(next, yield* gitView)
          })
        )
      })

    const unarchive: TicketsShape["unarchive"] = (id) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug } = scope
        return yield* withTicketDocumentLock(
          orgSlug,
          slug,
          id,
          Effect.gen(function* () {
            yield* requireArchivable(orgSlug, slug, id)
            const indexProject = indexProjectOf(scope)
            const next = yield* ticketDocs.update(
              orgSlug,
              slug,
              id,
              (existing) =>
                DateTime.nowAsDate.pipe(
                  Effect.map((updatedAt) => ({
                    ...existing,
                    archivedAt: null,
                    updatedAt
                  }))
                ),
              (next) => ticketIndex.upsertTicket(indexProject, next)
            )
            return yield* detailOf(next, yield* gitView)
          })
        )
      })

    const replaceTag = (
      orgSlug: string,
      slug: string,
      id: string,
      oldName: string,
      newName: string | null
    ): Effect.Effect<boolean, TicketReadError> =>
      withTicketDocumentLock(
        orgSlug,
        slug,
        id,
        Effect.gen(function* () {
          const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
          let replaced = false
          yield* ticketDocs.update(
            orgSlug,
            slug,
            id,
            (existing) => {
              if (!existing.tags.some((tag) => tag === oldName)) {
                return Effect.succeed(existing)
              }
              replaced = true
              const tags =
                newName === null
                  ? existing.tags.filter((tag) => tag !== oldName)
                  : existing.tags.map((tag) =>
                      tag === oldName ? makeTagName(newName) : tag
                    )
              return DateTime.nowAsDate.pipe(
                Effect.map((updatedAt) => ({ ...existing, tags, updatedAt }))
              )
            },
            (next) =>
              replaced
                ? ticketIndex.upsertTicket(indexProject, next)
                : Effect.void
          )
          if (!replaced) return false
          return true
        })
      )

    const replaceStatus = (
      orgSlug: string,
      slug: string,
      id: string,
      newStatus: string
    ): Effect.Effect<boolean, TicketReadError> =>
      withTicketDocumentLock(
        orgSlug,
        slug,
        id,
        Effect.gen(function* () {
          const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
          let replaced = false
          yield* ticketDocs.update(
            orgSlug,
            slug,
            id,
            (existing) => {
              if (existing.status === newStatus) {
                return Effect.succeed(existing)
              }
              replaced = true
              return DateTime.nowAsDate.pipe(
                Effect.map((updatedAt) => ({
                  ...existing,
                  status: newStatus as typeof existing.status,
                  updatedAt
                }))
              )
            },
            (next) =>
              replaced
                ? ticketIndex.upsertTicket(indexProject, next)
                : Effect.void
          )
          if (!replaced) return false
          return true
        })
      )

    const writeGitFields = (
      indexProject: TicketIndexProject,
      existing: TicketDocument,
      patch: {
        branch?: string | null
        branchAutoLinkDisabled?: boolean
        pr?: number | null
        prState?: TicketDocument["prState"]
        lastTransitionedPr?: number | null
        status?: TicketDocument["status"]
      }
    ): Effect.Effect<TicketDocument, TicketReadError> =>
      ticketDocs.update(
        indexProject.orgSlug,
        indexProject.projectSlug,
        existing.id,
        (current) =>
          DateTime.nowAsDate.pipe(
            Effect.map((updatedAt) => ({
              ...current,
              ...patch,
              updatedAt
            }))
          ),
        (next) => ticketIndex.upsertTicket(indexProject, next)
      )

    const createBranch: TicketsShape["createBranch"] = (id, input) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug, userId } = scope
        return yield* withTicketDocumentLock(
          orgSlug,
          slug,
          id,
          Effect.gen(function* () {
            const indexProject = indexProjectOf(scope)
            const projectGithub = yield* projects.githubIntegration()
            if (!projectGithub) {
              return yield* new Conflict({ reason: "no_github_connection" })
            }
            const ticket = yield* readTicket(orgSlug, slug, id)
            const baseBranch =
              input.baseBranch ?? projectGithub.defaultBaseBranch

            yield* github.createBranchAsUser(
              projectGithub.repoOwner,
              projectGithub.repoName,
              input.name,
              baseBranch,
              userId
            )

            const next = yield* withRepositoryBranchLock(
              projectGithub.repoId,
              writeGitFields(indexProject, ticket, {
                branch: input.name,
                branchAutoLinkDisabled: false,
                pr: null,
                prState: null,
                lastTransitionedPr: null
              })
            )
            return yield* detailOf(next, yield* gitView)
          })
        )
      })

    const attachBranch: TicketsShape["attachBranch"] = (id, input) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug } = scope
        return yield* withTicketDocumentLock(
          orgSlug,
          slug,
          id,
          Effect.gen(function* () {
            const indexProject = indexProjectOf(scope)
            const projectGithub = yield* projects.githubIntegration()
            if (!projectGithub) {
              return yield* new Conflict({ reason: "no_github_connection" })
            }
            const ticket = yield* readTicket(orgSlug, slug, id)

            const exists = yield* github.branchExistsInstallation(
              projectGithub.installationId,
              projectGithub.repoOwner,
              projectGithub.repoName,
              input.name
            )
            if (!exists) {
              return yield* new BranchNotFound({ name: input.name })
            }

            const next = yield* withRepositoryBranchLock(
              projectGithub.repoId,
              writeGitFields(indexProject, ticket, {
                branch: input.name,
                branchAutoLinkDisabled: false,
                pr: null,
                prState: null,
                lastTransitionedPr: null
              })
            )
            return yield* detailOf(next, yield* gitView)
          })
        )
      })

    const openPr: TicketsShape["openPr"] = (id, input) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug, userId } = scope
        return yield* withTicketDocumentLock(
          orgSlug,
          slug,
          id,
          Effect.gen(function* () {
            const indexProject = indexProjectOf(scope)
            const projectGithub = yield* projects.githubIntegration()
            if (!projectGithub) {
              return yield* new Conflict({ reason: "no_github_connection" })
            }
            const ticket = yield* readTicket(orgSlug, slug, id)
            if (!ticket.branch) {
              return yield* new Conflict({ reason: "no_branch_on_ticket" })
            }

            const base = projectGithub.defaultBaseBranch
            const result = yield* github.openPullRequestAsUser(
              projectGithub.repoOwner,
              projectGithub.repoName,
              {
                head: ticket.branch,
                base,
                title: input.title ?? ticket.title,
                body:
                  input.body ??
                  `Resolves ticket ${ticket.id}: ${ticket.title}\n\n` +
                    `_Tracked in ProjectProject._`,
                draft: input.draft ?? false
              },
              userId
            )

            yield* writeGitFields(indexProject, ticket, {
              pr: result.number,
              prState: "open",
              lastTransitionedPr: null
            })
            return result
          })
        )
      })

    const clearBranch: TicketsShape["clearBranch"] = (id) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug } = scope
        return yield* withTicketDocumentLock(
          orgSlug,
          slug,
          id,
          Effect.gen(function* () {
            const indexProject = indexProjectOf(scope)
            const ticket = yield* readTicket(orgSlug, slug, id)
            const next = yield* writeGitFields(indexProject, ticket, {
              branch: null,
              branchAutoLinkDisabled: true,
              pr: null,
              prState: null,
              lastTransitionedPr: null
            })
            return yield* detailOf(next, yield* gitView)
          })
        )
      })

    const fetchGitSnapshot = Effect.fn("Tickets.fetchGitSnapshot")(function* (
      projectGithub: ProjectGithubIntegration,
      tickets: ReadonlyArray<TicketIndexEntry>
    ) {
      const branches = [
        ...new Set(
          tickets.flatMap((ticket) =>
            ticket.branch && ticket.branch.length > 0 ? [ticket.branch] : []
          )
        )
      ]
      const unlinkedTicket = tickets.find(
        (ticket) => ticket.branch === null && ticket.archivedAt === null
      )
      const branchQuery = unlinkedTicket
        ? `${unlinkedTicket.id.slice(0, unlinkedTicket.id.lastIndexOf("-"))}-`
        : undefined
      return yield* github
        .fetchInstallationProjectStates(
          projectGithub.installationId,
          projectGithub.repoOwner,
          projectGithub.repoName,
          branches,
          branchQuery
        )
        .pipe(
          Effect.map((raw) => ({ ok: true as const, raw })),
          Effect.catchTags({
            RepoGone: () =>
              Effect.succeed({
                ok: false as const,
                tokenStatus: "ok" as const,
                repoStatus: "gone" as const
              }),
            RateLimited: (error) =>
              Effect.succeed({
                ok: false as const,
                tokenStatus: "ok" as const,
                repoStatus: "ok" as const,
                refreshStatus: "rate_limited" as const,
                retryAt: error.resetAt
              }),
            GitHubError: () =>
              Effect.succeed({
                ok: false as const,
                tokenStatus: "ok" as const,
                repoStatus: "ok" as const,
                refreshStatus: "stale" as const
              })
          })
        )
    })

    const reconcileGitStates = Effect.fn("Tickets.reconcileGitStates")(
      function* (
        indexProject: TicketIndexProject,
        projectGithub: ProjectGithubIntegration,
        tickets: ReadonlyArray<TicketIndexEntry>,
        raw: GitHub.RawProjectStates
      ): Effect.fn.Return<GitStatesResponse, MarkdownError> {
        const { orgSlug, projectSlug: slug } = indexProject
        const automaticLinks = planAutomaticBranchLinks(
          tickets,
          raw.existingBranches,
          raw.defaultBranch
        )
        const plannedTickets = tickets.map((ticket) => {
          const branch = automaticLinks.get(ticket.id)
          return branch
            ? {
                ...ticket,
                branch,
                pr: null,
                prState: null,
                lastTransitionedPr: null
              }
            : ticket
        })
        const plan = planTicketGitStates(
          plannedTickets,
          raw,
          yield* DateTime.nowAsDate
        )
        const indexedTickets = new Map(
          tickets.map((ticket) => [ticket.id, ticket])
        )
        const states = { ...plan.states }
        const staleTicketIds = new Set<string>()

        const resurrected = tickets.flatMap((ticket) =>
          ticket.branchDeletedAt !== null &&
          ticket.branch !== null &&
          raw.existingBranches.has(ticket.branch)
            ? [ticket.id]
            : []
        )
        const resurrectedIds = new Set(resurrected)
        const changedTicketIds = new Set<TicketId>()
        const writesById = new Map<
          TicketId,
          Parameters<typeof writeGitFields>[2]
        >(plan.writes.map((write) => [write.ticketId, write.patch]))
        for (const [ticketId, branch] of automaticLinks) {
          writesById.set(ticketId, {
            branch,
            pr: null,
            prState: null,
            lastTransitionedPr: null,
            ...writesById.get(ticketId)
          })
        }
        const ticketIds = new Set([...writesById.keys(), ...resurrectedIds])

        for (const ticketId of ticketIds) {
          const automaticBranch = automaticLinks.get(ticketId)
          const reconcile = Effect.gen(function* () {
            const ticket = yield* readTicket(orgSlug, slug, ticketId).pipe(
              Effect.catchTags({
                MalformedTicketDocument: (error) =>
                  Effect.logWarning(
                    "Skipping unreadable ticket for git state",
                    {
                      orgSlug,
                      slug,
                      ticketId,
                      error
                    }
                  ).pipe(Effect.as(null)),
                NotFound: () =>
                  Effect.logDebug("Skipping vanished indexed ticket", {
                    orgSlug,
                    slug,
                    ticketId
                  }).pipe(Effect.as(null))
              })
            )
            if (ticket === null) {
              staleTicketIds.add(ticketId)
              delete states[ticketId]
              return
            }
            const indexedTicket = indexedTickets.get(ticketId)
            if (
              indexedTicket?.branch !== ticket.branch ||
              indexedTicket.updatedAt.getTime() !==
                ticket.updatedAt.getTime() ||
              indexedTicket.pr !== ticket.pr ||
              indexedTicket.prState !== ticket.prState ||
              (raw.fetchedAt !== undefined &&
                ticket.updatedAt.getTime() > raw.fetchedAt.getTime())
            ) {
              staleTicketIds.add(ticketId)
              states[ticketId] = pendingGitState(ticket, projectGithub)
              return
            }
            if (automaticBranch) {
              const attached = yield* ticketIndex.isRepositoryBranchAttached(
                projectGithub.repoId,
                automaticBranch
              )
              if (
                ticket.branchAutoLinkDisabled ||
                ticket.archivedAt !== null ||
                attached
              ) {
                staleTicketIds.add(ticketId)
                states[ticketId] = pendingGitState(ticket, projectGithub)
                return
              }
            }
            if (resurrectedIds.has(ticketId)) {
              yield* ticketIndex.clearBranchStale(indexProject, [ticketId])
              changedTicketIds.add(ticketId)
            }
            const write = writesById.get(ticketId)
            if (!write) return
            yield* writeGitFields(indexProject, ticket, write)
            changedTicketIds.add(ticketId)
          })
          yield* withTicketDocumentLock(
            orgSlug,
            slug,
            ticketId,
            automaticBranch
              ? withRepositoryBranchLock(projectGithub.repoId, reconcile)
              : reconcile
          ).pipe(
            Effect.catchTags({
              NotFound: () =>
                Effect.sync(() => {
                  staleTicketIds.add(ticketId)
                  delete states[ticketId]
                }),
              MalformedTicketDocument: (error) =>
                Effect.logWarning("Skipping unreadable ticket for git state", {
                  orgSlug,
                  slug,
                  ticketId,
                  error
                }).pipe(
                  Effect.andThen(
                    Effect.sync(() => {
                      staleTicketIds.add(ticketId)
                      delete states[ticketId]
                    })
                  )
                )
            })
          )
        }

        return {
          states,
          refreshStatus: "fresh",
          changedTicketIds: [...changedTicketIds],
          transitioned: plan.transitioned.filter(
            (transition) => !staleTicketIds.has(transition.ticketId)
          ),
          tokenStatus: "ok",
          repoStatus: "ok"
        }
      }
    )

    const listGitStates: TicketsShape["listGitStates"] = () =>
      Effect.gen(function* () {
        const indexProject = indexProjectOf(yield* ProjectScope)
        const projectGithub = yield* projects.githubIntegration()

        if (!projectGithub) {
          return {
            states: {},
            transitioned: [],
            tokenStatus: "ok",
            repoStatus: "not_connected"
          }
        }

        const tickets = yield* ticketIndex.list(indexProject)
        const result = yield* fetchGitSnapshot(projectGithub, tickets)

        if (!result.ok) {
          return {
            states:
              result.repoStatus === "gone"
                ? {}
                : Object.fromEntries(
                    tickets.map((ticket) => [
                      ticket.id,
                      pendingGitState(ticket, projectGithub)
                    ])
                  ),
            transitioned: [],
            changedTicketIds: [],
            tokenStatus: result.tokenStatus,
            repoStatus: result.repoStatus,
            ...("refreshStatus" in result
              ? { refreshStatus: result.refreshStatus }
              : {}),
            ...("retryAt" in result ? { retryAt: result.retryAt } : {})
          }
        }

        if (result.raw.refreshStatus) {
          const snapshot = planTicketGitStates(
            tickets,
            result.raw,
            yield* DateTime.nowAsDate
          )
          return {
            states: Object.fromEntries(
              tickets.map((ticket) => [
                ticket.id,
                ticket.branch &&
                (result.raw.existingBranches.has(ticket.branch) ||
                  result.raw.prByBranch.has(ticket.branch))
                  ? snapshot.states[ticket.id]
                  : pendingGitState(ticket, projectGithub)
              ])
            ),
            transitioned: [],
            changedTicketIds: [],
            tokenStatus: "ok",
            repoStatus: "ok",
            refreshStatus: result.raw.refreshStatus,
            retryAt: result.raw.retryAt
          }
        }

        return yield* reconcileGitStates(
          indexProject,
          projectGithub,
          tickets,
          result.raw
        )
      })

    const getGitState: TicketsShape["getGitState"] = (ticketId) =>
      Effect.gen(function* () {
        const all = yield* listGitStates()
        if (ticketId === undefined) return all
        const single = all.states[ticketId]
        return {
          ...all,
          states: single ? { [ticketId]: single } : {},
          changedTicketIds: all.changedTicketIds?.filter(
            (id) => id === ticketId
          ),
          transitioned: all.transitioned.filter((t) => t.ticketId === ticketId)
        }
      })

    return {
      mine,
      mineByProject,
      recent,
      list,
      sections,
      sprintSections,
      count,
      search,
      listInGroup,
      tagUsageCounts,
      get,
      quickCreate,
      create,
      update,
      split,
      remove,
      archive,
      unarchive,
      replaceTag,
      replaceStatus,
      createBranch,
      attachBranch,
      openPr,
      clearBranch,
      listGitStates,
      getGitState
    } satisfies TicketsShape
  })
)
