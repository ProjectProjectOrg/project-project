import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
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
  NotFound,
  OpenPrInput,
  OpenPrResult,
  padNumericIdSort,
  paginateSorted,
  QuickCreateTicketInput,
  RateLimited,
  RepoGone,
  TagName,
  Ticket,
  TICKET_LIST_LIMIT,
  TicketDetail,
  TicketId,
  tryDecodeCursor,
  UpdateTicketInput,
  Validation,
  type ProjectKey,
  type TicketCountQuery,
  type TicketCounts,
  type TicketFilter,
  type TicketListPage,
  type TicketListQuery,
  type TicketPriority,
  type TicketSort,
  type TicketStatus
} from "@projectproject/shared"
import { matchesTicketQuery } from "@projectproject/shared"
import { validateBodyMentions } from "../Services/BodyMentions"
import { GitHub } from "../Services/GitHub"
import { Groups } from "../Services/Groups"
import type { MarkdownError } from "../Services/Markdown"
import { Projects } from "../Services/Projects"
import { TicketGitBranchIndex } from "../Services/TicketGitBranchIndex"
import { Db } from "../Services/Db"
import { projectIndex, projectTag } from "../db/schema"
import { eq } from "drizzle-orm"
import {
  MalformedTicketDocument,
  TicketDocs,
  type TicketDocument
} from "../Services/TicketDocs"
import { Tickets, type TicketsShape } from "../Services/Tickets"
import { planTicketGitStates } from "../ticketGitStatePlanner"
import type { ProjectGithubIntegration } from "../Services/Projects"

const MAX_CREATE_ATTEMPTS = 16
const makeTicketId = Schema.decodeUnknownSync(TicketId)
const makeTagName = Schema.decodeUnknownSync(TagName)

function numericTail(id: string): number {
  const dash = id.lastIndexOf("-")
  if (dash < 0) return Number.NaN
  return Number(id.slice(dash + 1))
}

type TicketReadError = NotFound | MarkdownError | MalformedTicketDocument

type TicketCollectionRead =
  | { readonly _tag: "Readable"; readonly document: TicketDocument }
  | {
      readonly _tag: "Unreadable"
      readonly ticketId: string
      readonly error: MalformedTicketDocument
    }

function nextIdFrom(key: ProjectKey, ids: ReadonlyArray<TicketId>): TicketId {
  let max = 0
  for (const id of ids) {
    const n = numericTail(id)
    if (Number.isFinite(n) && n > max) max = n
  }
  return makeTicketId(`${key}-${max + 1}`)
}

function pendingGitState(
  document: TicketDocument,
  github: ProjectGithubIntegration | null
): Ticket["gitState"] {
  if (!document.branch) return { tag: "no_branch" }
  const baseBranch = github?.defaultBaseBranch ?? "main"
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
  return { tag: "branch_pending", name: document.branch, baseBranch }
}

function documentToTicket(
  document: TicketDocument,
  github: ProjectGithubIntegration | null
): Ticket {
  const { body: _body, ...ticket } = document
  return { ...ticket, gitState: pendingGitState(document, github) }
}

function documentToDetail(
  document: TicketDocument,
  github: ProjectGithubIntegration | null
): TicketDetail {
  return { ...document, gitState: pendingGitState(document, github) }
}

const PRIORITY_ORDINAL: Record<TicketPriority, number> = {
  high: 3,
  med: 2,
  low: 1
}

const sortKeyValue = (t: Ticket, sort: TicketSort): string => {
  switch (sort.key) {
    case "id":
      return padNumericIdSort(t.id) ?? t.id
    case "created":
      return t.createdAt.toISOString()
    case "updated":
      return t.updatedAt.toISOString()
    case "title":
      return t.title.toLowerCase()
    case "priority":
      return String(PRIORITY_ORDINAL[t.priority]).padStart(2, "0")
  }
}

const sortTickets = (
  tickets: ReadonlyArray<Ticket>,
  sort: TicketSort
): ReadonlyArray<Ticket> => {
  const sign = sort.dir === "asc" ? 1 : -1
  return [...tickets].sort((a, b) => {
    const ka = sortKeyValue(a, sort)
    const kb = sortKeyValue(b, sort)
    if (ka < kb) return -1 * sign
    if (ka > kb) return 1 * sign
    return a.id.localeCompare(b.id)
  })
}

export const TicketsLive = Layer.effect(
  Tickets,
  Effect.gen(function* () {
    const ticketDocs = yield* TicketDocs
    const projects = yield* Projects
    const ticketBranchIndex = yield* TicketGitBranchIndex
    const github = yield* GitHub
    const groups = yield* Groups
    const db = yield* Db

    const ensureAccess = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<void, NotFound> =>
      projects.requireMember(orgSlug, userId, slug).pipe(Effect.asVoid)

    const resolveGroupMembers = (
      orgSlug: string,
      userId: string,
      slug: string,
      groupIds: ReadonlyArray<string | null> | undefined
    ): Effect.Effect<ReadonlySet<string> | null, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        if (groupIds === undefined || groupIds.length === 0) return null
        const wantsUngrouped = groupIds.includes(null)
        const explicitIds = groupIds.filter((id): id is string => id !== null)
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
          const inAnyActiveSprint = new Set<string>()
          for (const g of allGroups) {
            if (g.completedAt !== null) continue
            for (const t of g.tickets) inAnyActiveSprint.add(t)
          }
          const allTicketIds = yield* ticketDocs.listIds(orgSlug, slug)
          for (const id of allTicketIds) {
            if (!inAnyActiveSprint.has(id)) memberSet.add(id)
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

    const readTicketForCollection = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<TicketCollectionRead | null, MarkdownError> =>
      readTicket(orgSlug, slug, id).pipe(
        Effect.map(
          (document): TicketCollectionRead => ({ _tag: "Readable", document })
        ),
        Effect.catchTag("MalformedTicketDocument", (error) =>
          Effect.logWarning("Skipping unreadable ticket", {
            orgSlug,
            slug,
            ticketId: id,
            error
          }).pipe(
            Effect.as<TicketCollectionRead>({
              _tag: "Unreadable",
              ticketId: id,
              error
            })
          )
        ),
        Effect.catchTag("NotFound", () =>
          Effect.logDebug("Skipping vanished ticket reference", {
            orgSlug,
            slug,
            ticketId: id
          }).pipe(Effect.as(null))
        )
      )

    const readableTickets = (
      reads: ReadonlyArray<TicketCollectionRead | null>
    ): ReadonlyArray<TicketDocument> =>
      reads.flatMap((read) =>
        read !== null && read._tag === "Readable" ? [read.document] : []
      )

    const list = (
      orgSlug: string,
      userId: string,
      slug: string,
      query: TicketListQuery,
      limit?: number
    ): Effect.Effect<TicketListPage, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const groupMemberSet = yield* resolveGroupMembers(
          orgSlug,
          userId,
          slug,
          query.filter?.groupId
        )
        const ids =
          groupMemberSet === null
            ? yield* ticketDocs.listIds(orgSlug, slug)
            : [...groupMemberSet]
        const tickets = yield* Effect.forEach(
          ids,
          (id) => readTicketForCollection(orgSlug, slug, id),
          { concurrency: 8 }
        ).pipe(Effect.map(readableTickets))
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          userId,
          slug
        )

        const filtered = tickets
          .map((ticket) => documentToTicket(ticket, projectGithub))
          .filter((t) => matchesTicketQuery(t, query, userId))
        const sorted = sortTickets(filtered, query.sort)
        const cursor = tryDecodeCursor(query.cursor)
        return paginateSorted(sorted, {
          cursor,
          limit: limit ?? TICKET_LIST_LIMIT,
          sortKey: (t) => sortKeyValue(t, query.sort),
          id: (t) => t.id,
          dir: query.sort.dir
        })
      })

    const listInGroup = (
      orgSlug: string,
      userId: string,
      slug: string,
      groupId: string
    ): Effect.Effect<ReadonlyArray<Ticket>, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const group = yield* groups.get(orgSlug, userId, slug, groupId)
        const tickets = yield* Effect.forEach(
          group.tickets,
          (id) => readTicketForCollection(orgSlug, slug, id),
          { concurrency: 8 }
        ).pipe(Effect.map(readableTickets))
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          userId,
          slug
        )
        return tickets.map((ticket) => documentToTicket(ticket, projectGithub))
      })

    const SEARCH_DEFAULT_LIMIT = 24
    const SEARCH_MAX_LIMIT = 100

    const search = (
      orgSlug: string,
      userId: string,
      slug: string,
      options: {
        readonly q?: string
        readonly excludeGroupId?: string
        readonly limit?: number
      }
    ): Effect.Effect<ReadonlyArray<Ticket>, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const excluded = options.excludeGroupId
          ? new Set(
              (yield* groups
                .get(orgSlug, userId, slug, options.excludeGroupId)
                .pipe(
                  Effect.catchTag("NotFound", () =>
                    Effect.succeed({ tickets: [] as ReadonlyArray<string> })
                  )
                )).tickets
            )
          : null
        const ids = yield* ticketDocs.listIds(orgSlug, slug)
        const tickets = yield* Effect.forEach(
          ids,
          (id) => readTicketForCollection(orgSlug, slug, id),
          { concurrency: 8 }
        ).pipe(Effect.map(readableTickets))
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          userId,
          slug
        )
        const queryForMatch: Pick<TicketListQuery, "q"> = {
          q: options.q
        }
        const matched = tickets
          .map((ticket) => documentToTicket(ticket, projectGithub))
          .filter((t) => {
            if (excluded !== null && excluded.has(t.id)) return false
            return matchesTicketQuery(t, queryForMatch, userId)
          })
        const limit = Math.min(
          Math.max(1, options.limit ?? SEARCH_DEFAULT_LIMIT),
          SEARCH_MAX_LIMIT
        )
        return sortTickets(matched, DEFAULT_TICKET_SORT).slice(0, limit)
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
        const ids = yield* ticketDocs.listIds(orgSlug, slug)
        const tickets = yield* Effect.forEach(
          ids,
          (id) => readTicketForCollection(orgSlug, slug, id),
          { concurrency: 8 }
        ).pipe(Effect.map(readableTickets))
        const counts: Record<string, number> = {}
        for (const t of tickets) {
          for (const tag of t.tags) {
            counts[tag] = (counts[tag] ?? 0) + 1
          }
        }
        return counts
      })

    const count = (
      orgSlug: string,
      userId: string,
      slug: string,
      query: TicketCountQuery
    ): Effect.Effect<TicketCounts, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const groupMemberSet = yield* resolveGroupMembers(
          orgSlug,
          userId,
          slug,
          query.filter?.groupId
        )
        const ids =
          groupMemberSet === null
            ? yield* ticketDocs.listIds(orgSlug, slug)
            : [...groupMemberSet]
        const tickets = yield* Effect.forEach(
          ids,
          (id) => readTicketForCollection(orgSlug, slug, id),
          { concurrency: 8 }
        ).pipe(Effect.map(readableTickets))
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          userId,
          slug
        )

        const filterWithoutStatus: TicketFilter | undefined = query.filter
          ? { ...query.filter, status: undefined }
          : undefined
        const queryForCount: Pick<TicketListQuery, "filter" | "q"> = {
          filter: filterWithoutStatus,
          q: query.q
        }

        const matching = tickets
          .map((ticket) => documentToTicket(ticket, projectGithub))
          .filter((t) => matchesTicketQuery(t, queryForCount, userId))

        const byStatus: Record<TicketStatus, number> = {
          todo: 0,
          in_progress: 0,
          done: 0
        }
        for (const t of matching) byStatus[t.status]++

        return {
          total: matching.length,
          byStatus
        }
      })

    const get = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      id: string
    ): Effect.Effect<TicketDetail, TicketReadError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          ownerId,
          slug
        )
        const ticket = yield* readTicket(orgSlug, slug, id)
        return documentToDetail(ticket, projectGithub)
      })

    const validateTagsExist = (
      slug: string,
      requested: ReadonlyArray<string>
    ): Effect.Effect<void, NotFound | Validation> =>
      Effect.gen(function* () {
        if (requested.length === 0) return
        const projectRow = yield* db.query.projectIndex
          .findFirst({
            columns: { id: true },
            where: eq(projectIndex.slug, slug)
          })
          .pipe(Effect.orDie)
        if (!projectRow) return yield* new NotFound()
        const rows = yield* db.query.projectTag
          .findMany({
            columns: { name: true },
            where: eq(projectTag.projectId, projectRow.id)
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

    const validateBody = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      body: string
    ): Effect.Effect<void, NotFound | MentionInvalid | MarkdownError> =>
      Effect.gen(function* () {
        if (!body.includes("](mention:")) return
        const project = yield* projects.get(orgSlug, ownerId, slug)
        const memberIds = new Set<string>(project.members.map((m) => m.id))
        const ids = yield* ticketDocs.listIds(orgSlug, slug)
        const ticketIds = new Set<string>(ids)
        yield* validateBodyMentions(body, memberIds, ticketIds)
      })

    const validateAssigneesAreMembers = (
      orgSlug: string,
      slug: string,
      assignees: ReadonlyArray<string>
    ): Effect.Effect<void, Validation> =>
      Effect.gen(function* () {
        const invalid: string[] = []
        for (const assigneeId of assignees) {
          const ok = yield* projects
            .requireMember(orgSlug, assigneeId, slug)
            .pipe(
              Effect.as(true as const),
              Effect.catchTag("NotFound", () => Effect.succeed(false as const))
            )
          if (!ok) invalid.push(assigneeId)
        }
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
      buildDocument: (id: TicketId) => TicketDocument
    ): Effect.Effect<TicketDocument, MarkdownError> =>
      Effect.gen(function* () {
        const ids = yield* ticketDocs.listIds(orgSlug, slug)
        let candidate = nextIdFrom(projectKey, ids)
        for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
          const document = buildDocument(candidate)
          const result = yield* ticketDocs.create(orgSlug, slug, document).pipe(
            Effect.map(() => "ok" as const),
            Effect.catchTag("TicketIdTaken", () =>
              Effect.succeed("retry" as const)
            )
          )
          if (result === "ok") return document
          const freshIds = yield* ticketDocs.listIds(orgSlug, slug)
          candidate = nextIdFrom(projectKey, freshIds)
        }
        return yield* Effect.die(
          new Error(`could not allocate ticket id for "${slug}"`)
        )
      })

    const quickCreate = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      input: QuickCreateTicketInput
    ): Effect.Effect<Ticket, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        const projectKey = yield* projects.getKey(orgSlug, ownerId, slug)
        const now = yield* DateTime.nowAsDate
        const document = yield* writeWithIdAllocation(
          orgSlug,
          slug,
          projectKey,
          (id) => ({
            id,
            title: input.title,
            status: "todo",
            type: input.type ?? "other",
            priority: "med",
            tags: [],
            branch: null,
            pr: null,
            prState: null,
            lastTransitionedPr: null,
            assignees: [],
            createdBy: ownerId,
            createdAt: now,
            updatedAt: now,
            body: `# ${input.title}\n`
          })
        )
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          ownerId,
          slug
        )
        return documentToTicket(document, projectGithub)
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
        const projectKey = yield* projects.getKey(orgSlug, ownerId, slug)
        if (input.tags !== undefined) {
          yield* validateTagsExist(slug, input.tags)
        }
        if (input.assignees !== undefined && input.assignees.length > 0) {
          yield* validateAssigneesAreMembers(orgSlug, slug, input.assignees)
        }
        if (input.body !== undefined) {
          yield* validateBody(orgSlug, ownerId, slug, input.body)
        }
        const now = yield* DateTime.nowAsDate
        const document = yield* writeWithIdAllocation(
          orgSlug,
          slug,
          projectKey,
          (id) => ({
            id,
            title: input.title,
            status: input.status ?? "todo",
            type: input.type ?? "other",
            priority: input.priority ?? "med",
            tags: input.tags !== undefined ? [...input.tags] : [],
            branch: null,
            pr: null,
            prState: null,
            lastTransitionedPr: null,
            assignees:
              input.assignees !== undefined ? [...input.assignees] : [],
            createdBy: ownerId,
            createdAt: now,
            updatedAt: now,
            body: input.body ?? `# ${input.title}\n`
          })
        )
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          ownerId,
          slug
        )
        return documentToDetail(document, projectGithub)
      })

    const update = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      id: string,
      input: UpdateTicketInput
    ): Effect.Effect<
      TicketDetail,
      TicketReadError | Validation | MentionInvalid
    > =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        const existing = yield* readTicket(orgSlug, slug, id)

        if (input.tags !== undefined) {
          yield* validateTagsExist(slug, input.tags)
        }

        if (input.assignees !== undefined) {
          const existingSet = new Set(existing.assignees)
          const newcomers = input.assignees.filter(
            (assigneeId) => !existingSet.has(assigneeId)
          )
          if (newcomers.length > 0) {
            yield* validateAssigneesAreMembers(orgSlug, slug, newcomers)
          }
        }

        if (input.body !== undefined) {
          yield* validateBody(orgSlug, ownerId, slug, input.body)
        }

        const next: TicketDocument = {
          id: existing.id,
          title: input.title ?? existing.title,
          status: input.status ?? existing.status,
          type: input.type ?? existing.type,
          priority: input.priority ?? existing.priority,
          tags: input.tags !== undefined ? [...input.tags] : existing.tags,
          branch: existing.branch,
          pr: existing.pr,
          prState: existing.prState,
          lastTransitionedPr: existing.lastTransitionedPr,
          assignees:
            input.assignees !== undefined
              ? input.assignees
              : existing.assignees,
          createdBy: existing.createdBy,
          createdAt: existing.createdAt,
          updatedAt: yield* DateTime.nowAsDate,
          body: input.body ?? existing.body
        }

        yield* ticketDocs.write(orgSlug, slug, id, next)

        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          ownerId,
          slug
        )
        return documentToDetail(next, projectGithub)
      })

    const remove = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      id: string
    ): Effect.Effect<void, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        yield* groups.removeTicketFromAllGroups(orgSlug, slug, id)
        yield* ticketDocs.remove(orgSlug, slug, id)
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          ownerId,
          slug
        )
        if (projectGithub) {
          yield* ticketBranchIndex.clearTicket(
            projectGithub.projectIntegrationLinkId,
            id
          )
        }
      })

    const replaceTag = (
      orgSlug: string,
      slug: string,
      id: string,
      oldName: string,
      newName: string | null
    ): Effect.Effect<boolean, TicketReadError> =>
      Effect.gen(function* () {
        const existing = yield* readTicket(orgSlug, slug, id)
        if (!existing.tags.some((tag) => tag === oldName)) return false
        const nextTags =
          newName === null
            ? existing.tags.filter((t) => t !== oldName)
            : existing.tags.map((t) =>
                t === oldName ? makeTagName(newName) : t
              )
        const next: TicketDocument = {
          ...existing,
          tags: nextTags,
          updatedAt: yield* DateTime.nowAsDate
        }
        yield* ticketDocs.write(orgSlug, slug, id, next)
        return true
      })

    const writeGitFields = (
      orgSlug: string,
      slug: string,
      id: string,
      existing: TicketDocument,
      projectGithub: ProjectGithubIntegration | null | undefined,
      patch: {
        branch?: string | null
        pr?: number | null
        prState?: TicketDocument["prState"]
        lastTransitionedPr?: number | null
        status?: TicketDocument["status"]
      }
    ): Effect.Effect<TicketDocument, MarkdownError> =>
      Effect.gen(function* () {
        const next: TicketDocument = {
          ...existing,
          branch: patch.branch !== undefined ? patch.branch : existing.branch,
          pr: patch.pr !== undefined ? patch.pr : existing.pr,
          prState:
            patch.prState !== undefined ? patch.prState : existing.prState,
          lastTransitionedPr:
            patch.lastTransitionedPr !== undefined
              ? patch.lastTransitionedPr
              : existing.lastTransitionedPr,
          status: patch.status ?? existing.status,
          updatedAt: yield* DateTime.nowAsDate
        }
        yield* ticketDocs.write(orgSlug, slug, id, next)
        if (patch.branch !== undefined && projectGithub) {
          if (patch.branch) {
            yield* ticketBranchIndex.upsertTicketBranch(
              projectGithub,
              id,
              patch.branch
            )
          } else {
            yield* ticketBranchIndex.clearTicket(
              projectGithub.projectIntegrationLinkId,
              id
            )
          }
        }
        return next
      })

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
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
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

        const next = yield* writeGitFields(
          orgSlug,
          slug,
          id,
          ticket,
          projectGithub,
          {
            branch: input.name,
            pr: null,
            prState: null,
            lastTransitionedPr: null
          }
        )
        return documentToDetail(next, projectGithub)
      })

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
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
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

        const next = yield* writeGitFields(
          orgSlug,
          slug,
          id,
          ticket,
          projectGithub,
          {
            branch: input.name,
            pr: null,
            prState: null,
            lastTransitionedPr: null
          }
        )
        return documentToDetail(next, projectGithub)
      })

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
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
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

        yield* writeGitFields(orgSlug, slug, id, ticket, projectGithub, {
          pr: result.number,
          prState: "open",
          lastTransitionedPr: null
        })
        return result
      })

    const clearBranch = (
      orgSlug: string,
      userId: string,
      slug: string,
      id: string
    ): Effect.Effect<TicketDetail, TicketReadError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const projectGithub = yield* projects.getGithubIntegration(
          orgSlug,
          userId,
          slug
        )
        const ticket = yield* readTicket(orgSlug, slug, id)
        const next = yield* writeGitFields(
          orgSlug,
          slug,
          id,
          ticket,
          projectGithub,
          {
            branch: null,
            pr: null,
            prState: null,
            lastTransitionedPr: null
          }
        )
        return documentToDetail(next, null)
      })

    const listGitStates = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<GitStatesResponse, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
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

        const ids = yield* ticketDocs.listIds(orgSlug, slug)
        const tickets = yield* Effect.forEach(
          ids,
          (id) => readTicketForCollection(orgSlug, slug, id),
          { concurrency: 8 }
        ).pipe(Effect.map(readableTickets))
        const branches = [
          ...new Set(
            tickets.flatMap((ticket) =>
              ticket.branch && ticket.branch.length > 0 ? [ticket.branch] : []
            )
          )
        ]
        yield* ticketBranchIndex.rebuildProjectConnection(
          projectGithub,
          tickets.flatMap((ticket) =>
            ticket.branch
              ? [{ ticketId: ticket.id, branch: ticket.branch }]
              : []
          )
        )

        const result = yield* github
          .fetchInstallationProjectStates(
            projectGithub.installationId,
            projectGithub.repoOwner,
            projectGithub.repoName,
            branches
          )
          .pipe(
            Effect.map((raw) => ({ ok: true as const, raw })),
            Effect.catchTag("RepoGone", () =>
              Effect.succeed({
                ok: false as const,
                tokenStatus: "ok" as const,
                repoStatus: "gone" as const
              })
            ),
            Effect.catchTag("RateLimited", () =>
              Effect.succeed({
                ok: false as const,
                tokenStatus: "ok" as const,
                repoStatus: "ok" as const
              })
            ),
            Effect.catchTag("GitHubError", () =>
              Effect.succeed({
                ok: false as const,
                tokenStatus: "ok" as const,
                repoStatus: "ok" as const
              })
            )
          )

        if (!result.ok) {
          return {
            states: {},
            transitioned: [],
            tokenStatus: result.tokenStatus,
            repoStatus: result.repoStatus
          }
        }

        const ticketById = new Map(tickets.map((ticket) => [ticket.id, ticket]))
        const plan = planTicketGitStates(
          tickets,
          result.raw,
          yield* DateTime.nowAsDate
        )

        for (const write of plan.writes) {
          const ticket = ticketById.get(write.ticketId)
          if (!ticket) continue
          yield* writeGitFields(
            orgSlug,
            slug,
            write.ticketId,
            ticket,
            projectGithub,
            write.patch
          )
        }

        return {
          states: plan.states,
          transitioned: plan.transitioned,
          tokenStatus: "ok",
          repoStatus: "ok"
        }
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
          states: single ? { [ticketId]: single } : {},
          transitioned: all.transitioned.filter((t) => t.ticketId === ticketId),
          tokenStatus: all.tokenStatus,
          repoStatus: all.repoStatus
        }
      })

    return {
      list,
      count,
      search,
      listInGroup,
      tagUsageCounts,
      get,
      quickCreate,
      create,
      update,
      remove,
      replaceTag,
      createBranch,
      attachBranch,
      openPr,
      clearBranch,
      listGitStates,
      getGitState
    } satisfies TicketsShape
  })
)
