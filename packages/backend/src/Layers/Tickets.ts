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
  NotFound,
  OpenPrInput,
  OpenPrResult,
  padNumericIdSort,
  paginateSorted,
  RateLimited,
  RepoGone,
  TagName,
  Ticket,
  TicketDetail,
  TicketId,
  UpdateTicketInput,
  type CursorPayload,
  type TicketFilter
} from "@projectproject/shared"
import { matchesTicketFilter } from "../Services/TicketFilters"
import { GitHub } from "../Services/GitHub"
import { Groups } from "../Services/Groups"
import type { MarkdownError } from "../Services/Markdown"
import { Projects } from "../Services/Projects"
import { TicketDocs, type TicketDocument } from "../Services/TicketDocs"
import { Tickets, type TicketsShape } from "../Services/Tickets"
import { planTicketGitStates } from "../ticketGitStatePlanner"

const MAX_CREATE_ATTEMPTS = 16
const makeTicketId = Schema.decodeUnknownSync(TicketId)
const makeTagName = Schema.decodeUnknownSync(TagName)

function nextIdFrom(ids: ReadonlyArray<TicketId>): TicketId {
  let max = 0
  for (const id of ids) {
    const n = Number(id.slice(2))
    if (Number.isFinite(n) && n > max) max = n
  }
  return makeTicketId(`T-${max + 1}`)
}

function documentToTicket(document: TicketDocument): Ticket {
  const { body: _body, ...ticket } = document
  return ticket
}

export const TicketsLive = Layer.effect(
  Tickets,
  Effect.gen(function* () {
    const ticketDocs = yield* TicketDocs
    const projects = yield* Projects
    const github = yield* GitHub
    const groups = yield* Groups

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
    ): Effect.Effect<TicketDocument, NotFound | MarkdownError> =>
      ticketDocs.read(orgSlug, slug, id)

    const list = (
      orgSlug: string,
      ownerId: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<Ticket>, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        const ids = yield* ticketDocs.listIds(orgSlug, slug)
        const tickets = yield* Effect.forEach(
          ids,
          (id) => readTicket(orgSlug, slug, id),
          { concurrency: 8 }
        )
        return tickets
          .map(documentToTicket)
          .toSorted((a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2)))
      })

    const get = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      id: string
    ): Effect.Effect<TicketDetail, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        return yield* readTicket(orgSlug, slug, id)
      })

    const create = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      input: CreateTicketInput
    ): Effect.Effect<Ticket, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        const ids = yield* ticketDocs.listIds(orgSlug, slug)
        let candidate = nextIdFrom(ids)

        const now = yield* DateTime.nowAsDate
        const document: TicketDocument = {
          id: candidate,
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
        }

        for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
          const result = yield* ticketDocs
            .create(orgSlug, slug, { ...document, id: candidate })
            .pipe(
              Effect.map(() => "ok" as const),
              Effect.catchTag("TicketIdTaken", () =>
                Effect.succeed("retry" as const)
              )
            )
          if (result === "ok") {
            return documentToTicket({ ...document, id: candidate })
          }
          const freshIds = yield* ticketDocs.listIds(orgSlug, slug)
          candidate = nextIdFrom(freshIds)
        }
        return yield* Effect.die(
          new Error(`could not allocate ticket id for "${slug}"`)
        )
      })

    const update = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      id: string,
      input: UpdateTicketInput
    ): Effect.Effect<TicketDetail, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        const existing = yield* readTicket(orgSlug, slug, id)

        if (input.assignees !== undefined) {
          const existingSet = new Set(existing.assignees)
          for (const assigneeId of input.assignees) {
            if (!existingSet.has(assigneeId)) {
              yield* projects.requireMember(orgSlug, assigneeId, slug)
            }
          }
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
    ): Effect.Effect<boolean, NotFound | MarkdownError> =>
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

    const listPaged = (
      orgSlug: string,
      userId: string,
      slug: string,
      filter: TicketFilter | undefined,
      cursor: CursorPayload | undefined,
      limit: number
    ): Effect.Effect<
      { items: ReadonlyArray<Ticket>; nextCursor: string | null },
      NotFound | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, userId, slug)
        const groupMemberSet = yield* resolveGroupMembers(
          orgSlug,
          userId,
          slug,
          filter?.groupId
        )
        const ids = yield* ticketDocs.listIds(orgSlug, slug)
        const tickets = yield* Effect.forEach(
          ids,
          (id) => readTicket(orgSlug, slug, id),
          { concurrency: 8 }
        )
        const sorted = tickets
          .map(documentToTicket)
          .filter(
            (t) =>
              (groupMemberSet === null || groupMemberSet.has(t.id)) &&
              matchesTicketFilter(t, filter)
          )
          .toSorted(
            (a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2))
          )

        return paginateSorted(sorted, {
          cursor,
          limit,
          sortKey: (t) => padNumericIdSort(t.id) ?? "",
          id: (t) => t.id
        })
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
    ): Effect.Effect<TicketDetail, NotFound | MarkdownError> =>
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
          (id) => readTicket(orgSlug, slug, id),
          { concurrency: 8 }
        )

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
      listPaged,
      get,
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
