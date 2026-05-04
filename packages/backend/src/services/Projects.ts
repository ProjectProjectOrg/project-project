// Projects service — domain logic combining the DB index, the project_member
// table, and the markdown store.
//
// AUTHORITY MODEL
// ----------------------------------------------------------------------------
// `project_member` is the source of truth for permission checks. The markdown
// frontmatter mirrors the membership as a human/AI-readable list of usernames
// — it stays in sync after every write but is never trusted by the server.
// If they ever drift, the DB wins; a future maintenance command can rebuild
// frontmatter from DB rows.
//
// PERMISSIONS (per spec §"Permission model")
//
//   action            owner  admin  member
//   read project        ✓      ✓      ✓
//   edit name/body      ✓      ✓      –
//   delete project      ✓      –      –
//   add/remove member   ✓      ✓      –   (admin can't touch admins)
//   change role         ✓      –      –
//
// LIST SCOPE
// ----------------------------------------------------------------------------
// `list` joins `project_member` so members see every project they belong to,
// not just owned ones. Sorted by createdAt ascending to match the previous
// behavior.

import { Effect } from "effect"
import { and, asc, eq, inArray } from "drizzle-orm"
import {
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  NotFound,
  RepoGone
} from "@projectproject/shared"
import type {
  AddMemberInput,
  AssignableRole,
  ConnectGithubInput,
  CreateProjectInput,
  GithubConnection,
  Member,
  Project,
  ProjectDetail,
  Role,
  UpdateProjectInput
} from "@projectproject/shared"
import { projectIndex, projectMember, user } from "../db/schema"
import { Db } from "./Db"
import { GitHub } from "./GitHub"
import { Markdown, type MarkdownError } from "./Markdown"
import { Users } from "./Users"

const MAX_SLUG_ATTEMPTS = 100

// Parse the `github` block from raw frontmatter data. Defensive: if any
// field is missing or wrong-typed we return null rather than crash, since
// the on-disk frontmatter could be hand-edited.
function parseGithubFrontmatter(
  data: Record<string, unknown>
): GithubConnection | null {
  const raw = data["github"]
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const repoOwner = typeof obj.repoOwner === "string" ? obj.repoOwner : null
  const repoName = typeof obj.repoName === "string" ? obj.repoName : null
  if (!repoOwner || !repoName) return null
  const defaultBaseBranch =
    typeof obj.defaultBaseBranch === "string" ? obj.defaultBaseBranch : null
  return { repoOwner, repoName, defaultBaseBranch }
}

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export class Projects extends Effect.Service<Projects>()("Projects", {
  effect: Effect.gen(function* () {
    const db = yield* Db
    const md = yield* Markdown
    const users = yield* Users
    const github = yield* GitHub

    // --- DB helpers ----------------------------------------------------

    const getIndexRow = (slug: string): Effect.Effect<Project | null> =>
      db
        .select()
        .from(projectIndex)
        .where(eq(projectIndex.slug, slug))
        .limit(1)
        .pipe(
          Effect.map((rows) => rows[0] ?? null),
          Effect.orDie
        )

    const findFreeSlug = (base: string): Effect.Effect<string> =>
      Effect.gen(function* () {
        const safeBase = base.length > 0 ? base : "project"
        for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++) {
          const candidate = i === 0 ? safeBase : `${safeBase}-${i + 1}`
          const existing = yield* db
            .select({ slug: projectIndex.slug })
            .from(projectIndex)
            .where(eq(projectIndex.slug, candidate))
            .limit(1)
            .pipe(Effect.orDie)
          if (existing.length === 0) return candidate
        }
        return yield* Effect.die(
          new Error(`could not allocate unique slug for "${base}"`)
        )
      })

    // Materialise the wire-shape `Member[]` for a project by joining
    // `project_member` with `user`. Keeps the DB the source of truth for
    // both role and identity fields (no relying on stale frontmatter).
    const loadMembers = (slug: string): Effect.Effect<ReadonlyArray<Member>> =>
      db
        .select({
          id: user.id,
          username: user.username,
          name: user.name,
          email: user.email,
          image: user.image,
          role: projectMember.role
        })
        .from(projectMember)
        .innerJoin(user, eq(projectMember.userId, user.id))
        .where(eq(projectMember.projectSlug, slug))
        .pipe(
          Effect.map((rows) =>
            rows.map((r) => ({
              id: r.id,
              username: r.username,
              name: r.name,
              email: r.email,
              image: r.image,
              role: r.role as Role
            }))
          ),
          Effect.orDie
        )

    // --- List (member-scoped) ------------------------------------------

    const list = (userId: string): Effect.Effect<ReadonlyArray<Project>> =>
      db
        .select({
          slug: projectIndex.slug,
          name: projectIndex.name,
          ownerId: projectIndex.ownerId,
          createdAt: projectIndex.createdAt
        })
        .from(projectIndex)
        .innerJoin(
          projectMember,
          and(
            eq(projectMember.projectSlug, projectIndex.slug),
            eq(projectMember.userId, userId)
          )
        )
        .orderBy(asc(projectIndex.createdAt))
        .pipe(Effect.orDie)

    // --- Permission gates ----------------------------------------------

    // Resolves the caller's role on this project. NotFound covers both
    // "no such project" and "project exists but you're not a member" —
    // the wire doesn't distinguish, no info leak.
    const requireMember = (
      userId: string,
      slug: string
    ): Effect.Effect<{ role: Role }, NotFound> =>
      db
        .select({ role: projectMember.role })
        .from(projectMember)
        .where(
          and(
            eq(projectMember.projectSlug, slug),
            eq(projectMember.userId, userId)
          )
        )
        .limit(1)
        .pipe(
          Effect.flatMap((rows) =>
            rows[0]
              ? Effect.succeed({ role: rows[0].role as Role })
              : Effect.fail(new NotFound())
          ),
          Effect.orDie
        ) as Effect.Effect<{ role: Role }, NotFound>

    const requireRole = (
      userId: string,
      slug: string,
      allowed: ReadonlyArray<Role>
    ): Effect.Effect<{ role: Role }, NotFound | Forbidden> =>
      Effect.gen(function* () {
        const ctx = yield* requireMember(userId, slug)
        if (!allowed.includes(ctx.role)) {
          return yield* Effect.fail(new Forbidden())
        }
        return ctx
      })

    // --- Frontmatter sync ----------------------------------------------

    // Read the current `github` block straight from project.md. The block
    // is owned by the file (frontmatter is the source of truth for it),
    // so we preserve it across rewrites unless a caller is explicitly
    // changing it (`connectGithub` / `disconnectGithub`).
    const readGithubFromFile = (
      slug: string
    ): Effect.Effect<GithubConnection | null, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        const file = yield* md.readProjectFile(slug)
        return parseGithubFrontmatter(file.data)
      })

    // Rewrite `members:` in project.md to mirror the current DB membership.
    // We render `{ username, role }` so the file is grep/AI-friendly even
    // without a DB. If a user has no username yet (legacy account), we
    // fall back to their email so the row still resolves.
    //
    // `github` is passed explicitly so that membership-only changes
    // preserve whatever connection currently lives on disk. Callers that
    // are *changing* the connection pass the new value (or null to
    // disconnect).
    const syncFrontmatter = (
      slug: string,
      name: string,
      ownerId: string,
      createdAt: Date,
      body: string,
      members: ReadonlyArray<Member>,
      connection: GithubConnection | null
    ): Effect.Effect<void, MarkdownError> => {
      const fm: Record<string, unknown> = {
        slug,
        name,
        ownerId,
        createdAt: createdAt.toISOString(),
        members: members.map((m) => ({
          username: m.username ?? m.email,
          role: m.role
        }))
      }
      if (connection) {
        fm.github = {
          repoOwner: connection.repoOwner,
          repoName: connection.repoName,
          defaultBaseBranch: connection.defaultBaseBranch
        }
      }
      return md.writeProjectFile(slug, fm, body)
    }

    // --- CRUD ----------------------------------------------------------

    const create = (
      ownerId: string,
      input: CreateProjectInput
    ): Effect.Effect<Project> =>
      Effect.gen(function* () {
        const slug = yield* findFreeSlug(slugify(input.name))
        const createdAt = new Date()

        const [row] = yield* db
          .insert(projectIndex)
          .values({ slug, name: input.name, ownerId, createdAt })
          .returning()
          .pipe(Effect.orDie)

        // Owner membership row goes in DB first; the frontmatter mirror
        // happens immediately after. If anything below fails we roll the
        // DB back so we don't leave a half-created project.
        yield* db
          .insert(projectMember)
          .values({ projectSlug: slug, userId: ownerId, role: "owner" })
          .pipe(Effect.orDie)

        const rollback = db
          .delete(projectIndex)
          .where(eq(projectIndex.slug, slug))
          .pipe(Effect.orDie)

        const members = yield* loadMembers(slug)
        yield* syncFrontmatter(
          slug,
          input.name,
          ownerId,
          createdAt,
          `# ${input.name}\n`,
          members,
          null
        ).pipe(
          Effect.catchAll((cause) =>
            rollback.pipe(Effect.zipRight(Effect.die(cause)))
          )
        )

        return {
          slug: row.slug,
          name: row.name,
          ownerId: row.ownerId,
          createdAt: row.createdAt
        }
      })

    const get = (
      userId: string,
      slug: string
    ): Effect.Effect<ProjectDetail, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireMember(userId, slug)
        const indexRow = yield* getIndexRow(slug)
        if (indexRow === null) return yield* Effect.fail(new NotFound())
        const file = yield* md.readProjectFile(slug)
        const members = yield* loadMembers(slug)
        return {
          slug: indexRow.slug,
          name: indexRow.name,
          ownerId: indexRow.ownerId,
          createdAt: indexRow.createdAt,
          github: parseGithubFrontmatter(file.data),
          body: file.body,
          members
        }
      })

    const update = (
      userId: string,
      slug: string,
      input: UpdateProjectInput
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireRole(userId, slug, ["owner", "admin"])
        const indexRow = yield* getIndexRow(slug)
        if (indexRow === null) return yield* Effect.fail(new NotFound())
        const file = yield* md.readProjectFile(slug)

        const nextName = input.name ?? indexRow.name
        const nextBody = input.body ?? file.body

        if (input.name !== undefined && input.name !== indexRow.name) {
          yield* db
            .update(projectIndex)
            .set({ name: nextName })
            .where(eq(projectIndex.slug, slug))
            .pipe(Effect.orDie)
        }

        const members = yield* loadMembers(slug)
        const connection = parseGithubFrontmatter(file.data)
        yield* syncFrontmatter(
          slug,
          nextName,
          indexRow.ownerId,
          indexRow.createdAt,
          nextBody,
          members,
          connection
        )

        return {
          slug,
          name: nextName,
          ownerId: indexRow.ownerId,
          createdAt: indexRow.createdAt,
          github: connection,
          body: nextBody,
          members
        }
      })

    const remove = (
      userId: string,
      slug: string
    ): Effect.Effect<void, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireRole(userId, slug, ["owner"])
        // FS first; DB cascades will drop project_member rows on row delete.
        yield* md.removeProjectDir(slug)
        yield* db
          .delete(projectIndex)
          .where(eq(projectIndex.slug, slug))
          .pipe(Effect.orDie)
      })

    // --- Member management ---------------------------------------------

    // After every membership change we re-render the frontmatter so the
    // file mirrors the new DB state. `replayDetail` returns the post-write
    // ProjectDetail in the same shape as `get`. The github block is read
    // straight from the file and passed through unchanged — membership
    // edits don't touch the connection.
    const replayDetail = (
      slug: string
    ): Effect.Effect<ProjectDetail, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        const indexRow = yield* getIndexRow(slug)
        if (indexRow === null) return yield* Effect.fail(new NotFound())
        const file = yield* md.readProjectFile(slug)
        const members = yield* loadMembers(slug)
        const connection = parseGithubFrontmatter(file.data)
        yield* syncFrontmatter(
          slug,
          indexRow.name,
          indexRow.ownerId,
          indexRow.createdAt,
          file.body,
          members,
          connection
        )
        return {
          slug: indexRow.slug,
          name: indexRow.name,
          ownerId: indexRow.ownerId,
          createdAt: indexRow.createdAt,
          github: connection,
          body: file.body,
          members
        }
      })

    const addMember = (
      userId: string,
      slug: string,
      input: AddMemberInput
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireRole(userId, slug, ["owner", "admin"])
        const target = yield* users.findByEmail(input.email)
        if (target === null) return yield* Effect.fail(new NotFound())

        // Idempotent: re-adding upserts the role only if the caller is
        // owner (admins can't change roles). On exact match we no-op.
        const existing = yield* db
          .select({ role: projectMember.role })
          .from(projectMember)
          .where(
            and(
              eq(projectMember.projectSlug, slug),
              eq(projectMember.userId, target.id)
            )
          )
          .limit(1)
          .pipe(Effect.orDie)

        if (existing.length > 0) {
          const currentRole = existing[0].role as Role
          if (currentRole !== input.role) {
            const callerCtx = yield* requireMember(userId, slug)
            if (callerCtx.role !== "owner") {
              return yield* Effect.fail(new Forbidden())
            }
            yield* db
              .update(projectMember)
              .set({ role: input.role })
              .where(
                and(
                  eq(projectMember.projectSlug, slug),
                  eq(projectMember.userId, target.id)
                )
              )
              .pipe(Effect.orDie)
          }
        } else {
          yield* db
            .insert(projectMember)
            .values({
              projectSlug: slug,
              userId: target.id,
              role: input.role
            })
            .pipe(Effect.orDie)
        }

        return yield* replayDetail(slug)
      })

    const updateMember = (
      userId: string,
      slug: string,
      targetUserId: string,
      nextRole: AssignableRole
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireRole(userId, slug, ["owner"])
        const existing = yield* db
          .select({ role: projectMember.role })
          .from(projectMember)
          .where(
            and(
              eq(projectMember.projectSlug, slug),
              eq(projectMember.userId, targetUserId)
            )
          )
          .limit(1)
          .pipe(Effect.orDie)
        if (existing.length === 0) return yield* Effect.fail(new NotFound())
        // Owner role can't be reassigned via updateMember — that's a
        // future "transfer ownership" flow.
        if ((existing[0].role as Role) === "owner") {
          return yield* Effect.fail(new Forbidden())
        }
        yield* db
          .update(projectMember)
          .set({ role: nextRole })
          .where(
            and(
              eq(projectMember.projectSlug, slug),
              eq(projectMember.userId, targetUserId)
            )
          )
          .pipe(Effect.orDie)
        return yield* replayDetail(slug)
      })

    const removeMember = (
      userId: string,
      slug: string,
      targetUserId: string
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        const callerCtx = yield* requireRole(userId, slug, ["owner", "admin"])
        const existing = yield* db
          .select({ role: projectMember.role })
          .from(projectMember)
          .where(
            and(
              eq(projectMember.projectSlug, slug),
              eq(projectMember.userId, targetUserId)
            )
          )
          .limit(1)
          .pipe(Effect.orDie)
        if (existing.length === 0) return yield* Effect.fail(new NotFound())
        const targetRole = existing[0].role as Role
        if (targetRole === "owner") return yield* Effect.fail(new Forbidden())
        // Admin can't remove another admin; only owner can.
        if (targetRole === "admin" && callerCtx.role !== "owner") {
          return yield* Effect.fail(new Forbidden())
        }
        yield* db
          .delete(projectMember)
          .where(
            and(
              eq(projectMember.projectSlug, slug),
              eq(projectMember.userId, targetUserId)
            )
          )
          .pipe(Effect.orDie)
        return yield* replayDetail(slug)
      })

    // --- GitHub connection ------------------------------------------

    // Verifies the user can push to the repo before persisting. We don't
    // duplicate the connection in Postgres — project.md frontmatter is
    // the source of truth, same as members.
    const connectGithub = (
      userId: string,
      slug: string,
      input: ConnectGithubInput
    ): Effect.Effect<
      ProjectDetail,
      | NotFound
      | Forbidden
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | GitHubError
      | MarkdownError
    > =>
      Effect.gen(function* () {
        yield* requireRole(userId, slug, ["owner", "admin"])
        const indexRow = yield* getIndexRow(slug)
        if (indexRow === null) return yield* Effect.fail(new NotFound())
        const file = yield* md.readProjectFile(slug)

        yield* github.verifyAccess(input.repoOwner, input.repoName, userId)

        const next: GithubConnection = {
          repoOwner: input.repoOwner,
          repoName: input.repoName,
          defaultBaseBranch:
            input.defaultBaseBranch === undefined
              ? null
              : input.defaultBaseBranch
        }

        const members = yield* loadMembers(slug)
        yield* syncFrontmatter(
          slug,
          indexRow.name,
          indexRow.ownerId,
          indexRow.createdAt,
          file.body,
          members,
          next
        )

        return {
          slug: indexRow.slug,
          name: indexRow.name,
          ownerId: indexRow.ownerId,
          createdAt: indexRow.createdAt,
          github: next,
          body: file.body,
          members
        }
      })

    const disconnectGithub = (
      userId: string,
      slug: string
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireRole(userId, slug, ["owner", "admin"])
        const indexRow = yield* getIndexRow(slug)
        if (indexRow === null) return yield* Effect.fail(new NotFound())
        const file = yield* md.readProjectFile(slug)
        const members = yield* loadMembers(slug)
        yield* syncFrontmatter(
          slug,
          indexRow.name,
          indexRow.ownerId,
          indexRow.createdAt,
          file.body,
          members,
          null
        )
        return {
          slug: indexRow.slug,
          name: indexRow.name,
          ownerId: indexRow.ownerId,
          createdAt: indexRow.createdAt,
          github: null,
          body: file.body,
          members
        }
      })

    // Suppress unused-import warning for `inArray` — kept for the next
    // callsite that batches user lookups.
    void inArray
    // Same for `readGithubFromFile` — kept for callers in the Tickets
    // service that prefer to read the connection without `get`'s
    // permission check overhead.
    void readGithubFromFile

    return {
      list,
      create,
      get,
      update,
      remove,
      requireMember,
      addMember,
      updateMember,
      removeMember,
      connectGithub,
      disconnectGithub
    } as const
  })
}) {}
