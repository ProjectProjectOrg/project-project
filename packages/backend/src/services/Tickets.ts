// Tickets service — domain logic over the Markdown store.
//
// Tickets live in `<project>/tickets/<id>.md`. There's no DB index for them:
// the filesystem IS the store. List = scan + parse, get = parse, create =
// allocate next id and create file atomically, update = read-modify-write,
// delete = unlink.
//
// Permission gate: every method first verifies the caller can see the project
// (via Projects.getBySlug). If the project is missing or not owned by the
// caller, we return NotFound — same as for an unknown ticket id. The client
// gets one error to handle either way.
//
// Sequential ids: the next id is `max(existing) + 1`. To avoid races between
// concurrent creates, the markdown layer writes with the `wx` flag (fail on
// exists) and signals `TicketIdTaken`; we retry with the next id. Bounded.

import { Effect, Schema } from "effect"
import {
  BranchExists,
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
import { GitHub } from "./GitHub"
import { Markdown, type MarkdownError } from "./Markdown"
import { Projects } from "./Projects"

const MAX_CREATE_ATTEMPTS = 16

// Decoded shape of ticket frontmatter on disk. Mirrors the wire schema but
// dates are ISO strings here (gray-matter sometimes parses YAML scalars to
// strings, sometimes to Date — Schema.Date handles both forms via its decode).
//
// `pr` and `lastTransitionedPr` were added in the git-connection feature.
// Both default to null when missing so older ticket files keep parsing.
const TicketFrontmatter = Schema.Struct({
  id: TicketId,
  title: Schema.String,
  status: Schema.Literal("todo", "in_progress", "done"),
  type: Schema.Literal("feat", "bug", "chore", "other"),
  branch: Schema.NullOr(Schema.String),
  pr: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    default: () => null
  }),
  lastTransitionedPr: Schema.optionalWith(Schema.NullOr(Schema.Number), {
    default: () => null
  }),
  assignee: Schema.NullOr(Schema.String),
  createdBy: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date
})
type TicketFrontmatter = typeof TicketFrontmatter.Type

const decodeFrontmatter = Schema.decodeUnknown(TicketFrontmatter)

function nextIdFrom(ids: ReadonlyArray<string>): string {
  let max = 0
  for (const id of ids) {
    const n = Number(id.slice(2))
    if (Number.isFinite(n) && n > max) max = n
  }
  return `T-${max + 1}`
}

function bumpId(id: string): string {
  const n = Number(id.slice(2))
  return `T-${n + 1}`
}

function frontmatterToWire(fm: TicketFrontmatter): Ticket {
  return {
    id: fm.id,
    title: fm.title,
    status: fm.status,
    type: fm.type,
    branch: fm.branch,
    pr: fm.pr,
    lastTransitionedPr: fm.lastTransitionedPr,
    assignee: fm.assignee,
    createdBy: fm.createdBy,
    createdAt: fm.createdAt,
    updatedAt: fm.updatedAt
  }
}

function frontmatterToDisk(fm: TicketFrontmatter): Record<string, unknown> {
  return {
    id: fm.id,
    title: fm.title,
    status: fm.status,
    type: fm.type,
    branch: fm.branch,
    pr: fm.pr,
    lastTransitionedPr: fm.lastTransitionedPr,
    assignee: fm.assignee,
    createdBy: fm.createdBy,
    createdAt: fm.createdAt.toISOString(),
    updatedAt: fm.updatedAt.toISOString()
  }
}

export class Tickets extends Effect.Service<Tickets>()(
  "Tickets",
  {
    effect: Effect.gen(function*() {
      const md = yield* Markdown
      const projects = yield* Projects
      const github = yield* GitHub

      // Single permission gate for every ticket op. Any project member can
      // read/write tickets (per spec §"Permission model"). Non-members and
      // missing projects collapse to NotFound — same wire response either
      // way, no information leak about which projects exist.
      const ensureAccess = (
        userId: string,
        slug: string
      ): Effect.Effect<void, NotFound> =>
        Effect.gen(function*() {
          yield* projects.requireMember(userId, slug)
        })

      // Read + decode a single ticket file. NotFound when missing, dies on
      // schema mismatch (corruption is not a routine outcome the wire cares
      // about).
      const readTicket = (
        slug: string,
        id: string
      ): Effect.Effect<TicketFrontmatter & { body: string }, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          const file = yield* md.readTicketFile(slug, id)
          const fm = yield* decodeFrontmatter(file.data).pipe(Effect.orDie)
          return { ...fm, body: file.body }
        })

      const list = (
        ownerId: string,
        slug: string
      ): Effect.Effect<ReadonlyArray<Ticket>, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          yield* ensureAccess(ownerId, slug)
          const ids = yield* md.listTicketIds(slug)
          // Read each ticket. If any single one is corrupt we surface the
          // whole list as a defect; partial lists would be confusing.
          const tickets = yield* Effect.forEach(
            ids,
            (id) => readTicket(slug, id),
            { concurrency: 8 }
          )
          // Sort by numeric id ascending (T-1, T-2, ...). The filesystem order
          // isn't guaranteed.
          return [...tickets.map(frontmatterToWire)].sort(
            (a, b) => Number(a.id.slice(2)) - Number(b.id.slice(2))
          )
        })

      const get = (
        ownerId: string,
        slug: string,
        id: string
      ): Effect.Effect<TicketDetail, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          yield* ensureAccess(ownerId, slug)
          const t = yield* readTicket(slug, id)
          return { ...frontmatterToWire(t), body: t.body }
        })

      // Allocate the next id (max+1), retry on TicketIdTaken up to
      // MAX_CREATE_ATTEMPTS times (a concurrent create stole the slot).
      const create = (
        ownerId: string,
        slug: string,
        input: CreateTicketInput
      ): Effect.Effect<Ticket, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          yield* ensureAccess(ownerId, slug)
          const ids = yield* md.listTicketIds(slug)
          let candidate = nextIdFrom(ids)

          const now = new Date()
          const fm: TicketFrontmatter = {
            id: candidate as TicketId,
            title: input.title,
            status: "todo",
            type: input.type ?? "other",
            branch: null,
            pr: null,
            lastTransitionedPr: null,
            assignee: null,
            createdBy: ownerId,
            createdAt: now,
            updatedAt: now
          }

          for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
            const result = yield* md
              .createTicketFile(
                slug,
                candidate,
                frontmatterToDisk({ ...fm, id: candidate as TicketId }),
                `# ${input.title}\n`
              )
              .pipe(
                Effect.map(() => "ok" as const),
                Effect.catchTag("TicketIdTaken", () => Effect.succeed("retry" as const))
              )
            if (result === "ok") {
              return frontmatterToWire({ ...fm, id: candidate as TicketId })
            }
            candidate = bumpId(candidate)
          }
          return yield* Effect.die(
            new Error(`could not allocate ticket id for "${slug}"`)
          )
        })

      const update = (
        ownerId: string,
        slug: string,
        id: string,
        input: UpdateTicketInput
      ): Effect.Effect<TicketDetail, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          yield* ensureAccess(ownerId, slug)
          const existing = yield* readTicket(slug, id)

          // If an assignee is being set (and not cleared), verify the target
          // is a project member. `requireMember` returns NotFound if not —
          // collapse that response with our own NotFound, no separate error
          // taxonomy needed. Wire intentionally doesn't distinguish "no such
          // user" from "user not on this project".
          if (
            input.assignee !== undefined &&
            input.assignee !== null &&
            input.assignee !== existing.assignee
          ) {
            yield* projects.requireMember(input.assignee, slug)
          }

          const next: TicketFrontmatter = {
            id: existing.id,
            title: input.title ?? existing.title,
            status: input.status ?? existing.status,
            type: input.type ?? existing.type,
            branch: existing.branch,
            pr: existing.pr,
            lastTransitionedPr: existing.lastTransitionedPr,
            // assignee can be explicitly nulled; check for `undefined` not falsy
            assignee:
              input.assignee !== undefined ? input.assignee : existing.assignee,
            createdBy: existing.createdBy,
            createdAt: existing.createdAt,
            updatedAt: new Date()
          }
          const nextBody = input.body ?? existing.body

          yield* md.writeTicketFile(
            slug,
            id,
            frontmatterToDisk(next),
            nextBody
          )

          return { ...frontmatterToWire(next), body: nextBody }
        })

      const remove = (
        ownerId: string,
        slug: string,
        id: string
      ): Effect.Effect<void, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          yield* ensureAccess(ownerId, slug)
          yield* md.removeTicketFile(slug, id)
        })

      // --- Git operations -------------------------------------------------

      // Read-modify-write of just the git-related fields. Bumps updatedAt
      // because frontmatter changed; status, body, etc. unchanged.
      const writeGitFields = (
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
        Effect.gen(function*() {
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
          yield* md.writeTicketFile(slug, id, frontmatterToDisk(next), existing.body)
          return next
        })

      const createBranch = (
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
        Effect.gen(function*() {
          yield* ensureAccess(userId, slug)
          const project = yield* projects
            .get(userId, slug)
            .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
          if (!project.github) {
            return yield* Effect.fail(
              new Conflict({ reason: "no_github_connection" })
            )
          }
          const ticket = yield* readTicket(slug, id)
          const baseBranch =
            input.baseBranch ?? project.github.defaultBaseBranch ?? "main"

          yield* github.createBranch(
            project.github.repoOwner,
            project.github.repoName,
            input.name,
            baseBranch,
            userId
          )

          const next = yield* writeGitFields(slug, id, ticket, {
            branch: input.name,
            pr: null,
            lastTransitionedPr: null
          })
          return { ...frontmatterToWire(next), body: ticket.body }
        })

      const openPr = (
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
        Effect.gen(function*() {
          yield* ensureAccess(userId, slug)
          const project = yield* projects
            .get(userId, slug)
            .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))
          if (!project.github) {
            return yield* Effect.fail(
              new Conflict({ reason: "no_github_connection" })
            )
          }
          const ticket = yield* readTicket(slug, id)
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

          yield* writeGitFields(slug, id, ticket, {
            pr: result.number,
            lastTransitionedPr: null
          })
          return result
        })

      const clearBranch = (
        userId: string,
        slug: string,
        id: string
      ): Effect.Effect<TicketDetail, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          yield* ensureAccess(userId, slug)
          const ticket = yield* readTicket(slug, id)
          const next = yield* writeGitFields(slug, id, ticket, {
            branch: null,
            pr: null,
            lastTransitionedPr: null
          })
          return { ...frontmatterToWire(next), body: ticket.body }
        })

      // Single batched read of git state across every ticket in a project.
      // Mutates ticket markdown when:
      //   - the observed PR number differs from the stored `pr` field, OR
      //   - the PR is merged and we haven't auto-transitioned for this PR yet.
      // Both writes are idempotent. The `transitioned` array carries the
      // transitions that just happened so the frontend can show a toast.
      const listGitStates = (
        userId: string,
        slug: string
      ): Effect.Effect<GitStatesResponse, NotFound | MarkdownError> =>
        Effect.gen(function*() {
          yield* ensureAccess(userId, slug)
          const project = yield* projects
            .get(userId, slug)
            .pipe(Effect.catchTag("MarkdownError", (e) => Effect.die(e)))

          if (!project.github) {
            return {
              states: {},
              transitioned: [],
              tokenStatus: "ok",
              repoStatus: "not_connected"
            }
          }

          const ids = yield* md.listTicketIds(slug)
          const tickets = yield* Effect.forEach(
            ids,
            (id) => readTicket(slug, id),
            { concurrency: 8 }
          )

          // Try to fetch GitHub state. If the token / scope / repo is the
          // problem, return empty per-ticket states with the appropriate
          // status flag so the header chip can flip without us tagging
          // every ticket with the same error.
          const result = yield* github
            .fetchProjectStates(
              project.github.repoOwner,
              project.github.repoName,
              userId
            )
            .pipe(
              Effect.map((raw) => ({ ok: true as const, raw })),
              Effect.catchTag("GitHubTokenExpired", () =>
                Effect.succeed({ ok: false as const, tokenStatus: "expired" as const, repoStatus: "ok" as const })
              ),
              Effect.catchTag("GitHubScopeInsufficient", () =>
                Effect.succeed({ ok: false as const, tokenStatus: "scope_insufficient" as const, repoStatus: "ok" as const })
              ),
              Effect.catchTag("RepoGone", () =>
                Effect.succeed({ ok: false as const, tokenStatus: "ok" as const, repoStatus: "gone" as const })
              ),
              Effect.catchTag("RateLimited", () =>
                Effect.succeed({ ok: false as const, tokenStatus: "ok" as const, repoStatus: "ok" as const })
              ),
              Effect.catchTag("GitHubError", () =>
                Effect.succeed({ ok: false as const, tokenStatus: "ok" as const, repoStatus: "ok" as const })
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

            // Persist the observed PR number if it changed, so other
            // surfaces (ticket detail load) reflect it without another
            // fetch.
            if (ticket.pr !== pr.number) {
              yield* writeGitFields(slug, ticket.id, ticket, {
                pr: pr.number
              })
            }

            if (pr.state === "merged") {
              // Auto-transition: idempotent on lastTransitionedPr.
              if (
                ticket.status !== "done" &&
                ticket.lastTransitionedPr !== pr.number
              ) {
                yield* writeGitFields(slug, ticket.id, ticket, {
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
                // Already done, but record the PR as transitioned so we
                // don't loop next fetch.
                yield* writeGitFields(slug, ticket.id, ticket, {
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
        createBranch,
        openPr,
        clearBranch,
        listGitStates
      } as const
    }),
    dependencies: []
  }
) {}
