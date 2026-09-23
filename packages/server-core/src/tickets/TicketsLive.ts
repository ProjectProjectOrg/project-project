import { Db } from "@pp/db"
import {
  AttachBranchInput,
  BranchExists,
  BranchNotFound,
  BranchProtected,
  Conflict,
  CreateBranchInput,
  CreateTicketInput,
  DEFAULT_TICKET_SORT,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  GitStatesResponse,
  MentionInvalid,
  MY_TICKETS_DONE_WINDOW_DAYS,
  MY_TICKETS_LIMIT,
  NotFound,
  OpenPrInput,
  OpenPrResult,
  paginateSorted,
  QuickCreateTicketInput,
  RateLimited,
  RECENT_TICKETS_LIMIT,
  Forbidden,
  SprintCompletedImmutable,
  formatMentionHref,
  SplitTicketInput,
  SplitTicketResult,
  RepoGone,
  TagName,
  Ticket,
  TICKET_LIST_LIMIT,
  TicketDetail,
  extractAttachmentRefs,
  TicketId,
  UpdateTicketInput,
  Validation,
  type ProjectKey,
  type GroupId,
  type GroupIdFilter,
  type MyTicketsQuery,
  type OrgTicketPage,
  type OrgTicketRow,
  type TicketCountQuery,
  type TicketCounts,
  type TicketListPage,
  type TicketListQuery,
  type TicketSearchQuery,
  type TicketSections,
  type TicketSort,
  type TicketSprintSections,
  type TicketStatus,
  type TicketUpdateResult,
  type User,
  sprintSectionKey,
  sprintState
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { Attachments } from "../attachments/Attachments"
import { validateBodyMentionsWithLookups } from "../comments/BodyMentions"
import { Comments, type InvalidCommentBody } from "../comments/Comments"
import { FigmaLinks } from "../figma/FigmaLinks"
import * as GitHub from "../github/GitHub"
import { Groups } from "../groups/Groups"
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
  type TicketIndexQueryEntry,
  type TicketIndexProject
} from "./TicketIndex"
import { Tickets, type TicketsShape } from "./Tickets"

const makeTicketId = Schema.decodeUnknownSync(TicketId)
const makeTagName = Schema.decodeUnknownSync(TagName)

type TicketReadError = NotFound | MarkdownError | MalformedTicketDocument

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
  github: ProjectGithubIntegration | null,
  branchDeletedAt: Date | null = null
): Ticket {
  const { body: _body, commentsRegion: _commentsRegion, ...ticket } = document
  return {
    ...ticket,
    gitState: pendingGitState(document, github, branchDeletedAt)
  }
}

function indexEntryToTicket(
  entry: TicketIndexEntry,
  github: ProjectGithubIntegration | null
): Ticket {
  const { branchDeletedAt: _branchDeletedAt, ...ticket } = entry
  return {
    ...ticket,
    gitState: pendingGitState(entry, github, entry.branchDeletedAt)
  }
}

function ticketPage(
  entries: ReadonlyArray<TicketIndexQueryEntry>,
  query: TicketListQuery,
  github: ProjectGithubIntegration | null,
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
      ticket: indexEntryToTicket(entry, github),
      orderKey
    })),
    nextCursor: page.nextCursor
  }
}

function documentToDetail(
  document: TicketDocument,
  github: ProjectGithubIntegration | null,
  creator: User | null,
  updater: User | null,
  branchDeletedAt: Date | null = null
): TicketDetail {
  return {
    ...documentToTicket(document, github, branchDeletedAt),
    splitFrom: document.splitFrom ?? null,
    creator,
    updater,
    body: document.body
  }
}

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

    const detailOf = (
      document: TicketDocument,
      github: ProjectGithubIntegration | null,
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
              github,
              byId.get(document.createdBy) ?? null,
              byId.get(document.updatedBy) ?? null,
              branchDeletedAt
            )
          })
        )

    const ensureAccess = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<void, NotFound> =>
      projects.requireMember(orgSlug, userId, slug).pipe(Effect.asVoid)

    const resolveGroupMembers = (
      project: TicketIndexProject,
      orgSlug: string,
      userId: string,
      slug: string,
      groupIds: ReadonlyArray<GroupIdFilter> | undefined
    ): Effect.Effect<ReadonlySet<string> | null, NotFound | MarkdownError> =>
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
                .get(orgSlug, userId, slug, id)
                .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null))),
            { concurrency: 8 }
          )
          for (const g of details) {
            if (g === null) continue
            for (const t of g.tickets) memberSet.add(t)
          }
        }
        if (wantsUngrouped) {
          const allGroups = yield* groups.list(orgSlug, userId, slug)
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

    const list = (
      orgSlug: string,
      userId: string,
      slug: string,
      query: TicketListQuery,
      limit?: number
    ): Effect.Effect<TicketListPage, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const project = yield* ticketIndex.projectFor(orgSlug, slug)
        const groupMemberSet = yield* resolveGroupMembers(
          project,
          orgSlug,
          userId,
          slug,
          query.groupId
        )
        const pageLimit = limit ?? TICKET_LIST_LIMIT
        const queryEntries = yield* ticketIndex.query(project, query, {
          viewerId: userId,
          ticketIds: groupMemberSet === null ? undefined : [...groupMemberSet],
          limit: pageLimit + 1
        })
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          userId,
          slug
        )
        return ticketPage(queryEntries, query, projectGithub, pageLimit)
      })

    const visibleIndexProjects = (
      orgSlug: string,
      userId: string
    ): Effect.Effect<ReadonlyArray<TicketIndexProject>, NotFound> =>
      Effect.gen(function* () {
        const visible = yield* projects.list(orgSlug, userId)
        return yield* ticketIndex.projectsFor(
          orgSlug,
          visible.map((project) => project.slug)
        )
      })

    const orgTicketRows = (
      orgSlug: string,
      userId: string,
      entries: ReadonlyArray<TicketIndexOrgEntry>
    ): Effect.Effect<ReadonlyArray<OrgTicketRow>, NotFound> =>
      Effect.gen(function* () {
        const slugs = [
          ...new Set(entries.map(({ project }) => project.projectSlug))
        ]
        const integrations = yield* Effect.forEach(
          slugs,
          (slug) =>
            projects
              .getGithubIntegration(orgSlug, userId, slug)
              .pipe(Effect.map((integration) => [slug, integration] as const)),
          { concurrency: 8 }
        )
        const integrationBySlug = new Map(integrations)
        return entries.map(({ project, entry }) => ({
          projectSlug: project.projectSlug,
          ticket: indexEntryToTicket(
            entry,
            integrationBySlug.get(project.projectSlug) ?? null
          )
        }))
      })

    const mine = Effect.fn("Tickets.mine")(function* (
      orgSlug: string,
      userId: string,
      query: MyTicketsQuery
    ) {
      const visible = yield* visibleIndexProjects(orgSlug, userId)
      const now = yield* DateTime.now
      const doneAfter = DateTime.toDate(
        DateTime.subtract(now, { days: MY_TICKETS_DONE_WINDOW_DAYS })
      )
      const entries = yield* ticketIndex.assignedTo(visible, {
        viewerId: userId,
        doneAfter,
        cursor: query.cursor,
        limit: MY_TICKETS_LIMIT + 1
      })
      const page = paginateSorted(entries, {
        cursor: undefined,
        limit: MY_TICKETS_LIMIT,
        sortKey: (row) => row.sortValue,
        id: (row) => row.entry.id,
        dir: "desc"
      })
      const items = yield* orgTicketRows(orgSlug, userId, page.items)
      return { items, nextCursor: page.nextCursor } satisfies OrgTicketPage
    })

    const recent = Effect.fn("Tickets.recent")(function* (
      orgSlug: string,
      userId: string
    ) {
      const visible = yield* visibleIndexProjects(orgSlug, userId)
      const entries = yield* ticketIndex.touchedBy(visible, {
        viewerId: userId,
        limit: RECENT_TICKETS_LIMIT
      })
      return yield* orgTicketRows(orgSlug, userId, entries)
    })

    const listInGroup = (
      orgSlug: string,
      userId: string,
      slug: string,
      groupId: string
    ): Effect.Effect<ReadonlyArray<Ticket>, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const project = yield* ticketIndex.projectFor(orgSlug, slug)
        const group = yield* groups.get(orgSlug, userId, slug, groupId)
        const entries = yield* ticketIndex.list(project, group.tickets)
        const byId = new Map(entries.map((entry) => [entry.id, entry]))
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          userId,
          slug
        )
        return group.tickets.flatMap((id) => {
          const entry = byId.get(id)
          if (!entry || entry.archivedAt !== null) return []
          return [indexEntryToTicket(entry, projectGithub)]
        })
      })

    const SEARCH_DEFAULT_LIMIT = 24
    const SEARCH_MAX_LIMIT = 100

    const search = (
      orgSlug: string,
      userId: string,
      slug: string,
      options: TicketSearchQuery
    ): Effect.Effect<ReadonlyArray<Ticket>, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const project = yield* ticketIndex.projectFor(orgSlug, slug)
        const excludedTicketIds = options.excludeGroupId
          ? (yield* groups
              .get(orgSlug, userId, slug, options.excludeGroupId)
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
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          userId,
          slug
        )
        return queryEntries.map(({ entry }) =>
          indexEntryToTicket(entry, projectGithub)
        )
      })

    const tagUsageCounts = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<
      Readonly<Record<string, number>>,
      NotFound | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const project = yield* ticketIndex.projectFor(orgSlug, slug)
        return yield* ticketIndex.tagUsageCounts(project)
      })

    const count = (
      orgSlug: string,
      userId: string,
      slug: string,
      query: TicketCountQuery
    ): Effect.Effect<TicketCounts, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const project = yield* ticketIndex.projectFor(orgSlug, slug)
        const groupMemberSet = yield* resolveGroupMembers(
          project,
          orgSlug,
          userId,
          slug,
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
      orgSlug: string,
      userId: string,
      slug: string,
      query: TicketListQuery
    ): Effect.fn.Return<TicketSections, NotFound | MarkdownError> {
      yield* ensureAccess(orgSlug, userId, slug)
      const project = yield* ticketIndex.projectFor(orgSlug, slug)
      const groupMemberSet = yield* resolveGroupMembers(
        project,
        orgSlug,
        userId,
        slug,
        query.groupId
      )
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
      const projectGithub = yield* projects.getGithubIntegration(
        orgSlug,
        userId,
        slug
      )
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
                    ticketPage(entries, query, projectGithub, TICKET_LIST_LIMIT)
                  ] as const
              )
            ),
        { concurrency: 4 }
      )
      return { counts, sections: Object.fromEntries(pages) }
    })

    const sprintSections = Effect.fn("Tickets.sprintSections")(function* (
      orgSlug: string,
      userId: string,
      slug: string,
      query: TicketListQuery
    ): Effect.fn.Return<TicketSprintSections, NotFound | MarkdownError> {
      yield* ensureAccess(orgSlug, userId, slug)
      const project = yield* ticketIndex.projectFor(orgSlug, slug)
      const sprints = (yield* groups.list(orgSlug, userId, slug)).filter(
        (group) => group.kind === "sprint"
      )
      const sectionIds: ReadonlyArray<GroupIdFilter> = query.groupId?.length
        ? query.groupId
        : ["ungrouped", ...sprints.map((sprint) => sprint.id)]
      const projectGithub = yield* projects.getGithubIntegration(
        orgSlug,
        userId,
        slug
      )
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
        if (sprint.completedAt === null) {
          bySprint.set(sprint.id, takeUnclaimed(sprint.tickets))
        }
      }
      for (const sprint of sprints) {
        if (sprint.completedAt !== null) {
          bySprint.set(sprint.id, takeUnclaimed(sprint.tickets))
        }
      }
      const claimedIds = [...claimed]
      const countQuery = { ...query, groupId: undefined }
      const pages = yield* Effect.forEach(
        sectionIds,
        (groupId) =>
          Effect.gen(function* () {
            const known =
              groupId === "ungrouped" ? undefined : bySprint.get(groupId)
            const ticketIds =
              groupId === "ungrouped"
                ? undefined
                : known !== undefined
                  ? known
                  : yield* resolveGroupMembers(project, orgSlug, userId, slug, [
                      groupId
                    ]).pipe(
                      Effect.map((members) =>
                        members === null
                          ? []
                          : [...members].filter((id) => !claimed.has(id))
                      )
                    )
            const excludeTicketIds =
              groupId === "ungrouped" && claimedIds.length > 0
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
              key: sprintSectionKey(groupId === "ungrouped" ? null : groupId),
              count: counts.total,
              page: ticketPage(entries, query, projectGithub, TICKET_LIST_LIMIT)
            }
          }),
        { concurrency: 4 }
      )
      return {
        total: pages.reduce((sum, section) => sum + section.count, 0),
        sections: pages
      }
    })

    const get = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      id: string
    ): Effect.Effect<TicketDetail, TicketReadError> =>
      Effect.gen(function* () {
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          ownerId,
          slug
        )
        const ticket = yield* readTicket(orgSlug, slug, id)
        const branchDeletedAt = yield* ticketIndex.getBranchDeletedAt(
          orgSlug,
          slug,
          id
        )
        return yield* withMissingAttachments(
          orgSlug,
          yield* detailOf(ticket, projectGithub, branchDeletedAt)
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
      slug: string,
      requested: ReadonlyArray<string>
    ): Effect.Effect<void, NotFound | Validation> =>
      Effect.gen(function* () {
        if (requested.length === 0) return
        const projectRow = yield* db.query.projectIndex
          .findFirst({
            columns: { id: true },
            where: {
              RAW: (table, _operators) => _operators.eq(table.slug, slug)
            }
          })
          .pipe(Effect.orDie)
        if (!projectRow) return yield* new NotFound()
        const rows = yield* db.query.projectTag
          .findMany({
            columns: { name: true },
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.projectId, projectRow.id)
            }
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
      slug: string,
      requested: TicketStatus
    ): Effect.Effect<void, NotFound | Validation> =>
      Effect.gen(function* () {
        const projectRow = yield* db.query.projectIndex
          .findFirst({
            columns: { id: true },
            where: {
              RAW: (table, _operators) => _operators.eq(table.slug, slug)
            }
          })
          .pipe(Effect.orDie)
        if (!projectRow) return yield* new NotFound()
        const rows = yield* db.query.projectStatus
          .findMany({
            columns: { slug: true },
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.projectId, projectRow.id)
            }
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
      orgSlug: string,
      ownerId: string,
      slug: string,
      body: string,
      indexProject: TicketIndexProject
    ): Effect.Effect<void, NotFound | MentionInvalid | MarkdownError> =>
      validateBodyMentionsWithLookups(body, {
        existingTicketIds: (ticketIds) =>
          ticketIndex.existingIds(indexProject, ticketIds),
        memberIds: () =>
          projects
            .get(orgSlug, ownerId, slug)
            .pipe(
              Effect.map(
                (project) =>
                  new Set<string>(project.members.map((member) => member.id))
              )
            )
      })

    const validateAssigneesAreMembers = (
      orgSlug: string,
      slug: string,
      assignees: ReadonlyArray<string>
    ): Effect.Effect<void, Validation> =>
      Effect.gen(function* () {
        const checks = yield* Effect.forEach(
          assignees,
          (assigneeId) =>
            projects.requireMember(orgSlug, assigneeId, slug).pipe(
              Effect.as({ id: assigneeId, ok: true as const }),
              Effect.catchTag("NotFound", () =>
                Effect.succeed({ id: assigneeId, ok: false as const })
              )
            ),
          { concurrency: 8 }
        )
        const invalid = checks.filter((c) => !c.ok).map((c) => c.id)
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

    const quickCreate = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      input: QuickCreateTicketInput
    ): Effect.Effect<TicketDetail, NotFound | Validation | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        if (input.status !== undefined) {
          yield* validateStatusExists(slug, input.status)
        }
        const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
        const projectKey = yield* projects.getKey(orgSlug, ownerId, slug)
        const now = yield* DateTime.nowAsDate
        const document = yield* writeWithIdAllocation(
          orgSlug,
          slug,
          projectKey,
          indexProject,
          (id) => ({
            id,
            title: input.title,
            status: (input.status ?? "todo") as TicketStatus,
            type: input.type ?? "other",
            priority: "med",
            tags: [],
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
            body: "",
            commentsRegion: ""
          })
        )
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          ownerId,
          slug
        )
        return yield* detailOf(document, projectGithub)
      })

    const create = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      input: CreateTicketInput
    ): Effect.Effect<
      TicketDetail,
      NotFound | Validation | MentionInvalid | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
        const projectKey = yield* projects.getKey(orgSlug, ownerId, slug)
        if (input.tags !== undefined) {
          yield* validateTagsExist(slug, input.tags)
        }
        if (input.assignees !== undefined && input.assignees.length > 0) {
          yield* validateAssigneesAreMembers(orgSlug, slug, input.assignees)
        }
        if (input.body !== undefined) {
          yield* validateBody(orgSlug, ownerId, slug, input.body, indexProject)
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
            status: (input.status ?? "todo") as TicketStatus,
            type: input.type ?? "other",
            priority: input.priority ?? "med",
            tags: input.tags !== undefined ? [...input.tags] : [],
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
            body: input.body ?? "",
            commentsRegion: ""
          })
        )
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          ownerId,
          slug
        )
        return yield* detailOf(document, projectGithub)
      })

    const update = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      id: string,
      input: UpdateTicketInput,
      sort?: TicketSort
    ): Effect.Effect<
      TicketUpdateResult,
      TicketReadError | Validation | MentionInvalid
    > =>
      withTicketDocumentLock(
        orgSlug,
        slug,
        id,
        Effect.gen(function* () {
          const projectGithub = yield* projects.getGithubIntegration(
            orgSlug,
            ownerId,
            slug
          )
          const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)

          if (input.tags !== undefined) {
            yield* validateTagsExist(slug, input.tags)
          }

          if (input.body !== undefined) {
            yield* validateBody(
              orgSlug,
              ownerId,
              slug,
              input.body,
              indexProject
            )
          }

          const next = yield* ticketDocs.update(
            orgSlug,
            slug,
            id,
            (existing) =>
              Effect.gen(function* () {
                if (input.assignees !== undefined) {
                  const existingSet = new Set(existing.assignees)
                  const newcomers = input.assignees.filter(
                    (assigneeId) => !existingSet.has(assigneeId)
                  )
                  if (newcomers.length > 0) {
                    yield* validateAssigneesAreMembers(orgSlug, slug, newcomers)
                  }
                }
                return {
                  ...existing,
                  title: input.title ?? existing.title,
                  status: input.status ?? existing.status,
                  type: input.type ?? existing.type,
                  priority: input.priority ?? existing.priority,
                  tags:
                    input.tags !== undefined ? [...input.tags] : existing.tags,
                  assignees:
                    input.assignees !== undefined
                      ? input.assignees
                      : existing.assignees,
                  updatedBy: ownerId,
                  updatedAt: yield* DateTime.nowAsDate,
                  body: input.body ?? existing.body
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
            yield* detailOf(next, projectGithub)
          )
          const orderKey =
            sort === undefined
              ? null
              : yield* ticketIndex.orderKeyFor(indexProject, id, sort)
          return { ticket, orderKey }
        })
      )

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

    const split = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      input: SplitTicketInput
    ): Effect.Effect<
      SplitTicketResult,
      | TicketReadError
      | Validation
      | MentionInvalid
      | Forbidden
      | SprintCompletedImmutable
    > =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const [retainedInput, ...newInputs] = input.results
        if (retainedInput === undefined || newInputs.length === 0) {
          return yield* new Validation({ reason: "split_needs_two_results" })
        }

        const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
        const projectKey = yield* projects.getKey(orgSlug, userId, slug)
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          userId,
          slug
        )

        const assignees = [
          ...new Set(input.results.flatMap((result) => result.assignees))
        ]
        if (assignees.length > 0) {
          yield* validateAssigneesAreMembers(orgSlug, slug, assignees)
        }
        yield* Effect.forEach(
          [...new Set(input.results.map((result) => result.status))],
          (status) => validateStatusExists(slug, status),
          { discard: true }
        )

        const originalId = makeTicketId(id)
        const sprintTargets = input.results
          .map((result) => result.sprintId)
          .filter((sprintId) => sprintId !== null)
        if (sprintTargets.length > 0) {
          yield* groups.ensureSprintAssignable(
            orgSlug,
            userId,
            slug,
            sprintTargets
          )
        }
        const originalSprint = (yield* groups.list(orgSlug, userId, slug)).find(
          (group) =>
            group.kind === "sprint" &&
            group.completedAt === null &&
            group.tickets.includes(originalId)
        )
        const originalSprintId = originalSprint?.id ?? null
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
                    branch: null,
                    branchAutoLinkDisabled: true,
                    pr: null,
                    prState: null,
                    lastTransitionedPr: null,
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
          retained: yield* detailOf(written.retained, projectGithub),
          created: yield* Effect.forEach(written.createdDocuments, (document) =>
            detailOf(document, projectGithub)
          )
        }
      })

    const remove = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      id: string
    ): Effect.Effect<void, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
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

    const archive = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      reason?: string
    ): Effect.Effect<
      TicketDetail,
      TicketReadError | MentionInvalid | InvalidCommentBody
    > =>
      withTicketDocumentLock(
        orgSlug,
        slug,
        id,
        Effect.gen(function* () {
          yield* ensureAccess(orgSlug, userId, slug)
          const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
          const trimmed = reason?.trim()
          if (trimmed !== undefined && trimmed.length > 0) {
            yield* comments
              .create(orgSlug, userId, slug, makeTicketId(id), {
                body: trimmed
              })
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
          const projectGithub = yield* projects.getGithubIntegration(
            orgSlug,
            userId,
            slug
          )
          return yield* detailOf(next, projectGithub)
        })
      )

    const unarchive = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string
    ): Effect.Effect<TicketDetail, TicketReadError> =>
      withTicketDocumentLock(
        orgSlug,
        slug,
        id,
        Effect.gen(function* () {
          yield* ensureAccess(orgSlug, userId, slug)
          const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
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
          const projectGithub = yield* projects.getGithubIntegration(
            orgSlug,
            userId,
            slug
          )
          return yield* detailOf(next, projectGithub)
        })
      )

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

    const createBranch = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      input: CreateBranchInput
    ): Effect.Effect<
      TicketDetail,
      | NotFound
      | Conflict
      | BranchExists
      | BranchProtected
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | RateLimited
      | GitHubError
      | MarkdownError
      | MalformedTicketDocument
    > =>
      withTicketDocumentLock(
        orgSlug,
        slug,
        id,
        Effect.gen(function* () {
          yield* ensureAccess(orgSlug, userId, slug)
          const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
          const projectGithub = yield* projects.getGithubIntegration(
            orgSlug,
            userId,
            slug
          )
          if (!projectGithub) {
            return yield* new Conflict({ reason: "no_github_connection" })
          }
          const ticket = yield* readTicket(orgSlug, slug, id)
          const baseBranch = input.baseBranch ?? projectGithub.defaultBaseBranch

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
          return yield* detailOf(next, projectGithub)
        })
      )

    const attachBranch = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      input: AttachBranchInput
    ): Effect.Effect<
      TicketDetail,
      | NotFound
      | Conflict
      | BranchNotFound
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | RateLimited
      | GitHubError
      | MarkdownError
      | MalformedTicketDocument
    > =>
      withTicketDocumentLock(
        orgSlug,
        slug,
        id,
        Effect.gen(function* () {
          yield* ensureAccess(orgSlug, userId, slug)
          const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
          const projectGithub = yield* projects.getGithubIntegration(
            orgSlug,
            userId,
            slug
          )
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
          return yield* detailOf(next, projectGithub)
        })
      )

    const openPr = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string,
      input: OpenPrInput
    ): Effect.Effect<
      OpenPrResult,
      | NotFound
      | Conflict
      | BranchProtected
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | RateLimited
      | GitHubError
      | MarkdownError
      | MalformedTicketDocument
    > =>
      withTicketDocumentLock(
        orgSlug,
        slug,
        id,
        Effect.gen(function* () {
          yield* ensureAccess(orgSlug, userId, slug)
          const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
          const projectGithub = yield* projects.getGithubIntegration(
            orgSlug,
            userId,
            slug
          )
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

    const clearBranch = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string
    ): Effect.Effect<TicketDetail, TicketReadError> =>
      withTicketDocumentLock(
        orgSlug,
        slug,
        id,
        Effect.gen(function* () {
          yield* ensureAccess(orgSlug, userId, slug)
          const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
          const ticket = yield* readTicket(orgSlug, slug, id)
          const next = yield* writeGitFields(indexProject, ticket, {
            branch: null,
            branchAutoLinkDisabled: true,
            pr: null,
            prState: null,
            lastTransitionedPr: null
          })
          return yield* detailOf(next, null)
        })
      )

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

    const listGitStates = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<GitStatesResponse, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          userId,
          slug
        )

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

    const getGitState = (
      orgSlug: string,
      userId: string,
      slug: string,
      ticketId: string | undefined
    ): Effect.Effect<GitStatesResponse, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        const all = yield* listGitStates(orgSlug, userId, slug)
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
