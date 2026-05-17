// Tickets service — domain logic over the Markdown store.
//
// Tickets live at <org>/<project>/tickets/<id>.md. Every method takes
// `orgSlug` as its first parameter — same convention as Projects. There's no
// DB index for tickets: the filesystem IS the store.
//
// Permission gate: every method first verifies the caller can see the project
// (via Projects.requireMember). If the project is missing or not owned by the
// caller, we return NotFound — same as for an unknown ticket id.
//
// Sequential ids: the next id is `max(existing) + 1`. To avoid races between
// concurrent creates, the markdown layer writes with the `wx` flag (fail on
// exists) and signals `TicketIdTaken`; we retry with the next id. Bounded.

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
  type TicketListPage,
  type TicketListQuery,
  type TicketPriority,
  type TicketSort
} from "@projectproject/shared"
import { matchesTicketQuery } from "../Services/TicketFilters"
import { validateBodyMentions } from "../Services/BodyMentions"
import { GitHub } from "../Services/GitHub"
import { Groups } from "../Services/Groups"
import type { MarkdownError } from "../Services/Markdown"
import { Projects } from "../Services/Projects"
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

function documentToTicket(document: TicketDocument): Ticket {
  const { body: _body, ...ticket } = document
  return ticket
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
      groupIds: ReadonlyArray<string> | undefined
    ): Effect.Effect<ReadonlySet<string> | null, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        if (groupIds === undefined) return null
        if (groupIds.length === 0) return new Set<string>()
        const details = yield* Effect.forEach(
          groupIds,
          (id) => groups.get(orgSlug, userId, slug, id),
          { concurrency: 8 }
        )
        const set = new Set<string>()
        for (const g of details) for (const t of g.tickets) set.add(t)
        return set
      })

    const readTicket = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<
      TicketDocument,
      NotFound | MarkdownError | MalformedTicketDocument
    > =>
      ticketDocs.read(orgSlug, slug, id)

    const readTicketForCollection = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<TicketCollectionRead, NotFound | MarkdownError> =>
      readTicket(orgSlug, slug, id).pipe(
        Effect.map((document) => ({ _tag: "Readable" as const, document })),
        Effect.catchTag("MalformedTicketDocument", (error) =>
          Effect.logWarning("Skipping unreadable ticket", {
            orgSlug,
            slug,
            ticketId: id,
            error
          }).pipe(
            Effect.as({
              _tag: "Unreadable" as const,
              ticketId: id,
              error
            })
          )
        )
      )

    const readableTickets = (
      reads: ReadonlyArray<TicketCollectionRead>
    ): ReadonlyArray<TicketDocument> =>
      reads.flatMap((read) => (read._tag === "Readable" ? [read.document] : []))

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
        const ids = yield* ticketDocs.listIds(orgSlug, slug)
        const tickets = yield* Effect.forEach(
          ids,
          (id) => readTicketForCollection(orgSlug, slug, id),
          { concurrency: 8 }
        ).pipe(Effect.map(readableTickets))

        const filtered = tickets
          .map(documentToTicket)
          .filter(
            (t) =>
              (groupMemberSet === null || groupMemberSet.has(t.id)) &&
              matchesTicketQuery(t, query, userId)
          )
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

    const get = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      id: string
    ): Effect.Effect<TicketDetail, TicketReadError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        return yield* readTicket(orgSlug, slug, id)
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
          const ok = yield* projects.requireMember(orgSlug, assigneeId, slug).pipe(
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
          const result = yield* ticketDocs
            .create(orgSlug, slug, document)
            .pipe(
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
            lastTransitionedPr: null,
            assignees: [],
            createdBy: ownerId,
            createdAt: now,
            updatedAt: now,
            body: `# ${input.title}\n`
          })
        )
        return documentToTicket(document)
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
            lastTransitionedPr: null,
            assignees:
              input.assignees !== undefined ? [...input.assignees] : [],
            createdBy: ownerId,
            createdAt: now,
            updatedAt: now,
            body: input.body ?? `# ${input.title}\n`
          })
        )
        return document
      })

    const update = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      id: string,
      input: UpdateTicketInput
    ): Effect.Effect<TicketDetail, TicketReadError | Validation | MentionInvalid> =>
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

        return next
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

    // --- Git operations -------------------------------------------------

    const writeGitFields = (
      orgSlug: string,
      slug: string,
      id: string,
      existing: TicketDocument,
      patch: {
        branch?: string | null
        pr?: number | null
        lastTransitionedPr?: number | null
        status?: TicketDocument["status"]
      }
    ): Effect.Effect<TicketDocument, MarkdownError> =>
      Effect.gen(function* () {
        const next: TicketDocument = {
          ...existing,
          branch: patch.branch !== undefined ? patch.branch : existing.branch,
          pr: patch.pr !== undefined ? patch.pr : existing.pr,
          lastTransitionedPr:
            patch.lastTransitionedPr !== undefined
              ? patch.lastTransitionedPr
              : existing.lastTransitionedPr,
          status: patch.status ?? existing.status,
          updatedAt: yield* DateTime.nowAsDate
        }
        yield* ticketDocs.write(orgSlug, slug, id, next)
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
        const project = yield* projects
          .get(orgSlug, userId, slug)
          .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
        if (!project.github) {
          return yield* new Conflict({ reason: "no_github_connection" })
        }
        const ticket = yield* readTicket(orgSlug, slug, id)
        const baseBranch =
          input.baseBranch ?? project.github.defaultBaseBranch ?? "main"

        yield* github.createBranch(
          project.github.repoOwner,
          project.github.repoName,
          input.name,
          baseBranch,
          userId
        )

        const next = yield* writeGitFields(orgSlug, slug, id, ticket, {
          branch: input.name,
          pr: null,
          lastTransitionedPr: null
        })
        return next
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
        const project = yield* projects
          .get(orgSlug, userId, slug)
          .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
        if (!project.github) {
          return yield* new Conflict({ reason: "no_github_connection" })
        }
        const ticket = yield* readTicket(orgSlug, slug, id)

        const exists = yield* github.branchExists(
          project.github.repoOwner,
          project.github.repoName,
          input.name,
          userId
        )
        if (!exists) {
          return yield* new BranchNotFound({ name: input.name })
        }

        const next = yield* writeGitFields(orgSlug, slug, id, ticket, {
          branch: input.name,
          pr: null,
          lastTransitionedPr: null
        })
        return next
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
        const project = yield* projects
          .get(orgSlug, userId, slug)
          .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
        if (!project.github) {
          return yield* new Conflict({ reason: "no_github_connection" })
        }
        const ticket = yield* readTicket(orgSlug, slug, id)
        if (!ticket.branch) {
          return yield* new Conflict({ reason: "no_branch_on_ticket" })
        }

        const base = project.github.defaultBaseBranch ?? "main"
        const result = yield* github.openPullRequest(
          project.github.repoOwner,
          project.github.repoName,
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

        yield* writeGitFields(orgSlug, slug, id, ticket, {
          pr: result.number,
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
        const ticket = yield* readTicket(orgSlug, slug, id)
        const next = yield* writeGitFields(orgSlug, slug, id, ticket, {
          branch: null,
          pr: null,
          lastTransitionedPr: null
        })
        return next
      })

    const listGitStates = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<GitStatesResponse, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const project = yield* projects
          .get(orgSlug, userId, slug)
          .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))

        if (!project.github) {
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

        const result = yield* github
          .fetchProjectStates(
            project.github.repoOwner,
            project.github.repoName,
            userId
          )
          .pipe(
            Effect.map((raw) => ({ ok: true as const, raw })),
            Effect.catchTag("GitHubTokenExpired", () =>
              Effect.succeed({
                ok: false as const,
                tokenStatus: "expired" as const,
                repoStatus: "ok" as const
              })
            ),
            Effect.catchTag("GitHubScopeInsufficient", () =>
              Effect.succeed({
                ok: false as const,
                tokenStatus: "scope_insufficient" as const,
                repoStatus: "ok" as const
              })
            ),
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
