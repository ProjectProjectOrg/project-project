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

import { Effect, Layer, Schema } from "effect"
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
  GitState,
  GitStatesResponse,
  NotFound,
  OpenPrInput,
  OpenPrResult,
  RateLimited,
  RepoGone,
  Ticket,
  TicketDetail,
  TicketId,
  TransitionRecord,
  UpdateTicketInput
} from "@projectproject/shared"
import { GitHub } from "../Services/GitHub"
import { Groups } from "../Services/Groups"
import { Markdown, type MarkdownError } from "../Services/Markdown"
import { Projects } from "../Services/Projects"
import { Tickets, type TicketsShape } from "../Services/Tickets"

const MAX_CREATE_ATTEMPTS = 16

const TicketFrontmatter = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: Schema.Literal("todo", "in_progress", "done"),
  type: Schema.Literal("feat", "bug", "chore", "other"),
  priority: Schema.optionalWith(Schema.Literal("low", "med", "high"), {
    default: () => "med" as const
  }),
  tags: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => []
  }),
  branch: Schema.NullOr(Schema.String),
  pr: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    default: () => null
  }),
  lastTransitionedPr: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    default: () => null
  }),
  assignees: Schema.optionalWith(Schema.Array(Schema.String), {
    default: () => []
  }),
  createdBy: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date
})
type TicketFrontmatter = typeof TicketFrontmatter.Type

const decodeFrontmatter = Schema.decodeUnknown(TicketFrontmatter)

function decodeFrontmatterCompat(raw: unknown) {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>
    if (r.assignees === undefined && "assignee" in r) {
      const legacy = r.assignee
      r.assignees = typeof legacy === "string" ? [legacy] : []
    }
  }
  return decodeFrontmatter(raw)
}

function nextIdFrom(ids: ReadonlyArray<string>): string {
  let max = 0
  for (const id of ids) {
    const n = Number(id.slice(2))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `T-${max + 1}`
}

function frontmatterToDisk(fm: TicketFrontmatter): Record<string, unknown> {
  return {
    id: fm.id,
    title: fm.title,
    status: fm.status,
    type: fm.type,
    priority: fm.priority,
    tags: fm.tags,
    branch: fm.branch,
    pr: fm.pr,
    lastTransitionedPr: fm.lastTransitionedPr,
    assignees: fm.assignees,
    createdBy: fm.createdBy,
    createdAt: fm.createdAt.toISOString(),
    updatedAt: fm.updatedAt.toISOString()
  }
}

function frontmatterToWire(fm: TicketFrontmatter): Ticket {
  return {
    id: fm.id,
    title: fm.title,
    status: fm.status,
    type: fm.type,
    priority: fm.priority,
    tags: fm.tags as Ticket["tags"],
    branch: fm.branch,
    pr: fm.pr,
    lastTransitionedPr: fm.lastTransitionedPr,
    assignees: fm.assignees,
    createdBy: fm.createdBy,
    createdAt: fm.createdAt,
    updatedAt: fm.updatedAt
  }
}

export const TicketsLive = Layer.effect(
  Tickets,
  Effect.gen(function* () {
    const md = yield* Markdown
    const projects = yield* Projects
    const github = yield* GitHub
    const groups = yield* Groups

    const ensureAccess = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<void, NotFound> =>
      Effect.gen(function* () {
        yield* projects.requireMember(orgSlug, userId, slug)
      })

    const readTicket = (
      orgSlug: string,
      slug: string,
      id: string
    ): Effect.Effect<
      TicketFrontmatter & { body: string },
      NotFound | MarkdownError
    > =>
      Effect.gen(function* () {
        const file = yield* md.readTicketFile(orgSlug, slug, id)
        const fm = yield* decodeFrontmatterCompat(file.data).pipe(Effect.orDie)
        return { ...fm, body: file.body }
      })

    const list = (
      orgSlug: string,
      ownerId: string,
      slug: string
    ): Effect.Effect<ReadonlyArray<Ticket>, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        const ids = yield* md.listTicketIds(orgSlug, slug)
        const tickets = yield* Effect.forEach(
          ids,
          (id) => readTicket(orgSlug, slug, id),
          { concurrency: 8 }
        )
        return [...tickets.map(frontmatterToWire)].sort(
          (a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2))
        )
      })

    const get = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      id: string
    ): Effect.Effect<TicketDetail, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        const t = yield* readTicket(orgSlug, slug, id)
        return { ...frontmatterToWire(t), body: t.body }
      })

    const create = (
      orgSlug: string,
      ownerId: string,
      slug: string,
      input: CreateTicketInput
    ): Effect.Effect<Ticket, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* ensureAccess(orgSlug, ownerId, slug)
        const ids = yield* md.listTicketIds(orgSlug, slug)
        let candidate = nextIdFrom(ids)

        const now = new Date()
        const fm: TicketFrontmatter = {
          id: candidate as TicketId,
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
          updatedAt: now
        }

        for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
          const result = yield* md
            .createTicketFile(
              orgSlug,
              slug,
              candidate,
              frontmatterToDisk({ ...fm, id: candidate as TicketId }),
              `# ${input.title}\n`
            )
            .pipe(
              Effect.map(() => "ok" as const),
              Effect.catchTag("TicketIdTaken", () =>
                Effect.succeed("retry" as const)
              )
            )
          if (result === "ok") {
            return frontmatterToWire({ ...fm, id: candidate as TicketId })
          }
          const freshIds = yield* md.listTicketIds(orgSlug, slug)
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

        const next: TicketFrontmatter = {
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
          updatedAt: new Date()
        }
        const nextBody = input.body ?? existing.body

        yield* md.writeTicketFile(
          orgSlug,
          slug,
          id,
          frontmatterToDisk(next),
          nextBody
        )

        return { ...frontmatterToWire(next), body: nextBody }
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
        yield* md.removeTicketFile(orgSlug, slug, id)
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
        if (!existing.tags.includes(oldName)) return false
        const nextTags =
          newName === null
            ? existing.tags.filter((t) => t !== oldName)
            : existing.tags.map((t) => (t === oldName ? newName : t))
        const { body, ...fm } = existing
        const next: TicketFrontmatter = {
          ...fm,
          tags: nextTags,
          updatedAt: new Date()
        }
        yield* md.writeTicketFile(
          orgSlug,
          slug,
          id,
          frontmatterToDisk(next),
          body
        )
        return true
      })

    // --- Git operations -------------------------------------------------

    const writeGitFields = (
      orgSlug: string,
      slug: string,
      id: string,
      existing: TicketFrontmatter & { body: string },
      patch: {
        branch?: string | null
        pr?: number | null
        lastTransitionedPr?: number | null
        status?: TicketFrontmatter["status"]
      }
    ): Effect.Effect<TicketFrontmatter, MarkdownError> =>
      Effect.gen(function* () {
        const next: TicketFrontmatter = {
          ...existing,
          branch: patch.branch !== undefined ? patch.branch : existing.branch,
          pr: patch.pr !== undefined ? patch.pr : existing.pr,
          lastTransitionedPr:
            patch.lastTransitionedPr !== undefined
              ? patch.lastTransitionedPr
              : existing.lastTransitionedPr,
          status: patch.status ?? existing.status,
          updatedAt: new Date()
        }
        yield* md.writeTicketFile(
          orgSlug,
          slug,
          id,
          frontmatterToDisk(next),
          existing.body
        )
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
          return yield* Effect.fail(
            new Conflict({ reason: "no_github_connection" })
          )
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
        return { ...frontmatterToWire(next), body: ticket.body }
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
          return yield* Effect.fail(
            new Conflict({ reason: "no_github_connection" })
          )
        }
        const ticket = yield* readTicket(orgSlug, slug, id)

        const exists = yield* github.branchExists(
          project.github.repoOwner,
          project.github.repoName,
          input.name,
          userId
        )
        if (!exists) {
          return yield* Effect.fail(new BranchNotFound({ name: input.name }))
        }

        const next = yield* writeGitFields(orgSlug, slug, id, ticket, {
          branch: input.name,
          pr: null,
          lastTransitionedPr: null
        })
        return { ...frontmatterToWire(next), body: ticket.body }
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
          return yield* Effect.fail(
            new Conflict({ reason: "no_github_connection" })
          )
        }
        const ticket = yield* readTicket(orgSlug, slug, id)
        if (!ticket.branch) {
          return yield* Effect.fail(
            new Conflict({ reason: "no_branch_on_ticket" })
          )
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
        return { ...frontmatterToWire(next), body: ticket.body }
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

        const ids = yield* md.listTicketIds(orgSlug, slug)
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

        const raw = result.raw
        const states: Record<string, GitState> = {}
        const transitioned: TransitionRecord[] = []

        for (const ticket of tickets) {
          if (!ticket.branch) {
            states[ticket.id] = { tag: "no_branch" }
            continue
          }

          const pr = raw.prByBranch.get(ticket.branch)
          const branchExists = raw.existingBranches.has(ticket.branch)

          if (!pr && !branchExists) {
            states[ticket.id] = { tag: "stale_branch", name: ticket.branch }
            continue
          }
          if (!pr) {
            states[ticket.id] = {
              tag: "branch_no_pr",
              name: ticket.branch,
              baseBranch: raw.defaultBranch
            }
            continue
          }

          if (ticket.pr !== pr.number) {
            yield* writeGitFields(orgSlug, slug, ticket.id, ticket, {
              pr: pr.number
            })
          }

          if (pr.state === "merged") {
            if (
              ticket.status !== "done" &&
              ticket.lastTransitionedPr !== pr.number
            ) {
              yield* writeGitFields(orgSlug, slug, ticket.id, ticket, {
                status: "done",
                pr: pr.number,
                lastTransitionedPr: pr.number
              })
              transitioned.push({
                ticketId: ticket.id,
                fromStatus: ticket.status,
                toStatus: "done",
                prNumber: pr.number
              })
            } else if (ticket.lastTransitionedPr !== pr.number) {
              yield* writeGitFields(orgSlug, slug, ticket.id, ticket, {
                pr: pr.number,
                lastTransitionedPr: pr.number
              })
            }
            states[ticket.id] = {
              tag: "pr_merged",
              branch: ticket.branch,
              baseBranch: pr.baseRefName,
              number: pr.number,
              url: pr.url,
              title: pr.title,
              mergedAt: pr.mergedAt ?? new Date()
            }
            continue
          }

          if (pr.state === "closed") {
            states[ticket.id] = {
              tag: "pr_closed",
              branch: ticket.branch,
              baseBranch: pr.baseRefName,
              number: pr.number,
              url: pr.url,
              title: pr.title
            }
            continue
          }

          states[ticket.id] = {
            tag: "pr_open",
            branch: ticket.branch,
            baseBranch: pr.baseRefName,
            number: pr.number,
            url: pr.url,
            draft: pr.draft,
            title: pr.title,
            checks: pr.checks
          }
        }

        return {
          states,
          transitioned,
          tokenStatus: "ok",
          repoStatus: "ok"
        }
      })

    return {
      list,
      get,
      create,
      update,
      remove,
      replaceTag,
      createBranch,
      attachBranch,
      openPr,
      clearBranch,
      listGitStates
    } satisfies TicketsShape
  })
)
