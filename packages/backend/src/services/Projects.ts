// Projects service — domain logic combining the DB index, the project_member
// table, and the markdown store.
//
// ORG DIMENSION (T-02)
// ----------------------------------------------------------------------------
// Every public method takes `orgSlug` as its first parameter — projects are
// scoped under an org. The slug is plumbed in by handlers; this layer doesn't
// resolve it. `create` looks up the org's UUID from the slug to populate
// `projectIndex.organizationId`. Existing DB queries on `projectIndex.slug`
// stay slug-only (T-01 schema state); switching them to `(orgId, slug)`
// happens once T-03's migration tightens `organizationId` to NOT NULL.
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

import { Effect, Schema } from "effect"
import { and, asc, eq, inArray } from "drizzle-orm"
import {
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  NotFound,
  RepoGone,
  Role,
  Slug
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
  UpdateProjectInput
} from "@projectproject/shared"
import { organization, projectIndex, projectMember, user } from "../db/schema"
import { Db } from "./Db"
import { GitHub } from "./GitHub"
import { Markdown, type MarkdownError } from "./Markdown"
import { Users } from "./Users"

const MAX_SLUG_ATTEMPTS = 100

// Defensive: project.md should carry an `org:` field after T-02 writes,
// but pre-migration files won't have it. Log a warning so we notice drift,
// but don't crash — the handler's `orgSlug` parameter is authoritative.
function checkOrgFrontmatter(
  expected: string,
  data: Record<string, unknown>,
  slug: string
): void {
  const onDisk = data["org"]
  if (onDisk === undefined) {
    console.warn(
      `[markdown] project '${slug}' has no 'org' frontmatter (expected '${expected}'). Run migrate:orgs.`
    )
    return
  }
  if (onDisk !== expected) {
    const onDiskSafe =
      typeof onDisk === "string" ? onDisk : JSON.stringify(onDisk)
    console.warn(
      `[markdown] project '${slug}' frontmatter org='${onDiskSafe}' does not match request org='${expected}'.`
    )
  }
}

// On-disk `project.md` frontmatter shape. Decoded at every read site so
// hand-edits or partial writes surface as a defect rather than as silently
// wrong data downstream. `members` and `github` use disk-flavored shapes
// (just the fields the file carries — the wire `Member` schema is fuller,
// and the wire `GithubConnection` matches the disk shape exactly here).
const FrontmatterMember = Schema.Struct({
  username: Schema.String,
  role: Role
})

const FrontmatterGithub = Schema.Struct({
  repoOwner: Schema.String,
  repoName: Schema.String,
  defaultBaseBranch: Schema.optionalWith(Schema.NullOr(Schema.String), {
    default: () => null
  })
})

const ProjectFrontmatter = Schema.Struct({
  org: Schema.optional(Slug),
  slug: Slug,
  name: Schema.String,
  createdBy: Schema.optional(Schema.String),
  createdAt: Schema.Date,
  members: Schema.optionalWith(Schema.Array(FrontmatterMember), {
    default: () => []
  }),
  github: Schema.optionalWith(Schema.NullOr(FrontmatterGithub), {
    default: () => null
  })
})
type ProjectFrontmatter = typeof ProjectFrontmatter.Type

const decodeProjectFrontmatter = Schema.decodeUnknown(ProjectFrontmatter)

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

    // --- Markdown read with frontmatter validation --------------------
    // Decoded shape failures die — frontmatter corruption is not a wire
    // outcome, same as how the Tickets service treats decode errors.
    const readProject = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<
      ProjectFrontmatter & { body: string },
      NotFound | MarkdownError
    > =>
      Effect.gen(function* () {
        const file = yield* md.readProjectFile(orgSlug, slug)
        checkOrgFrontmatter(orgSlug, file.data, slug)
        const fm = yield* decodeProjectFrontmatter(file.data).pipe(Effect.orDie)
        return { ...fm, body: file.body }
      })

    // --- DB helpers ----------------------------------------------------

    const orgIdFromSlug = (orgSlug: string): Effect.Effect<string, NotFound> =>
      db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.slug, orgSlug))
        .limit(1)
        .pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] ? Effect.succeed(rows[0].id) : Effect.fail(new NotFound())
          )
        )

    const getIndexRow = (orgSlug: string, slug: string) =>
      Effect.gen(function* () {
        const organizationId = yield* orgIdFromSlug(orgSlug)
        return yield* db
          .select()
          .from(projectIndex)
          .where(
            and(
              eq(projectIndex.slug, slug),
              eq(projectIndex.organizationId, organizationId)
            )
          )
          .limit(1)
          .pipe(
            Effect.map((rows) => rows[0] ?? null),
            Effect.orDie
          )
      })

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

    const list = (
      orgSlug: string,
      userId: string
    ): Effect.Effect<ReadonlyArray<Project>, NotFound> =>
      Effect.gen(function* () {
        const organizationId = yield* orgIdFromSlug(orgSlug)
        return yield* db
          .select({
            slug: projectIndex.slug,
            name: projectIndex.name,
            createdBy: projectIndex.createdBy,
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
          .where(eq(projectIndex.organizationId, organizationId))
          .orderBy(asc(projectIndex.createdAt))
          .pipe(
            Effect.map((rows) => rows.map((r) => ({ ...r, org: orgSlug }))),
            Effect.orDie
          )
      })

    // --- Permission gates ----------------------------------------------

    const requireMember = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<{ role: Role }, NotFound> =>
      Effect.gen(function* () {
        const organizationId = yield* orgIdFromSlug(orgSlug)
        return yield* db
          .select({ role: projectMember.role })
          .from(projectMember)
          .innerJoin(
            projectIndex,
            eq(projectIndex.slug, projectMember.projectSlug)
          )
          .where(
            and(
              eq(projectMember.projectSlug, slug),
              eq(projectMember.userId, userId),
              eq(projectIndex.organizationId, organizationId)
            )
          )
          .limit(1)
          .pipe(
            Effect.orDie,
            Effect.flatMap((rows) =>
              rows[0]
                ? Effect.succeed({ role: rows[0].role as Role })
                : Effect.fail(new NotFound())
            )
          )
      })

    const requireRole = (
      orgSlug: string,
      userId: string,
      slug: string,
      allowed: ReadonlyArray<Role>
    ): Effect.Effect<{ role: Role }, NotFound | Forbidden> =>
      Effect.gen(function* () {
        const ctx = yield* requireMember(orgSlug, userId, slug)
        if (!allowed.includes(ctx.role)) {
          return yield* Effect.fail(new Forbidden())
        }
        return ctx
      })

    // --- Frontmatter sync ----------------------------------------------

    const readGithubFromFile = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<GithubConnection | null, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        const fm = yield* readProject(orgSlug, slug)
        return fm.github
      })

    const syncFrontmatter = (
      orgSlug: string,
      slug: string,
      name: string,
      createdBy: string,
      createdAt: Date,
      body: string,
      members: ReadonlyArray<Member>,
      connection: GithubConnection | null
    ): Effect.Effect<void, MarkdownError> => {
      const fm: Record<string, unknown> = {
        org: orgSlug,
        slug,
        name,
        createdBy,
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
      return md.writeProjectFile(orgSlug, slug, fm, body)
    }

    // --- CRUD ----------------------------------------------------------

    const create = (
      orgSlug: string,
      createdBy: string,
      input: CreateProjectInput
    ): Effect.Effect<Project, NotFound> =>
      Effect.gen(function* () {
        const organizationId = yield* orgIdFromSlug(orgSlug)
        const slug = yield* findFreeSlug(slugify(input.name))
        const createdAt = new Date()

        const [row] = yield* db
          .insert(projectIndex)
          .values({
            slug,
            name: input.name,
            createdBy,
            createdAt,
            organizationId
          })
          .returning()
          .pipe(Effect.orDie)

        yield* db
          .insert(projectMember)
          .values({ projectSlug: slug, userId: createdBy, role: "owner" })
          .pipe(Effect.orDie)

        const rollback = db
          .delete(projectIndex)
          .where(eq(projectIndex.slug, slug))
          .pipe(Effect.orDie)

        const members = yield* loadMembers(slug)
        yield* syncFrontmatter(
          orgSlug,
          slug,
          input.name,
          createdBy,
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
          org: orgSlug,
          slug: row.slug,
          name: row.name,
          createdBy: row.createdBy,
          createdAt: row.createdAt
        }
      })

    const get = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<ProjectDetail, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireMember(orgSlug, userId, slug)
        const indexRow = yield* getIndexRow(orgSlug, slug)
        if (indexRow === null) return yield* Effect.fail(new NotFound())
        const file = yield* readProject(orgSlug, slug)
        const members = yield* loadMembers(slug)
        return {
          org: orgSlug,
          slug: indexRow.slug,
          name: indexRow.name,
          createdBy: indexRow.createdBy,
          createdAt: indexRow.createdAt,
          github: file.github,
          body: file.body,
          members
        }
      })

    const update = (
      orgSlug: string,
      userId: string,
      slug: string,
      input: UpdateProjectInput
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const indexRow = yield* getIndexRow(orgSlug, slug)
        if (indexRow === null) return yield* Effect.fail(new NotFound())
        const file = yield* readProject(orgSlug, slug)

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
        yield* syncFrontmatter(
          orgSlug,
          slug,
          nextName,
          indexRow.createdBy,
          indexRow.createdAt,
          nextBody,
          members,
          file.github
        )

        return {
          org: orgSlug,
          slug,
          name: nextName,
          createdBy: indexRow.createdBy,
          createdAt: indexRow.createdAt,
          github: file.github,
          body: nextBody,
          members
        }
      })

    const remove = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<void, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireRole(orgSlug, userId, slug, ["owner"])
        yield* md.removeProjectDir(orgSlug, slug)
        yield* db
          .delete(projectIndex)
          .where(eq(projectIndex.slug, slug))
          .pipe(Effect.orDie)
      })

    // --- Member management ---------------------------------------------

    const replayDetail = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ProjectDetail, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        const indexRow = yield* getIndexRow(orgSlug, slug)
        if (indexRow === null) return yield* Effect.fail(new NotFound())
        const file = yield* readProject(orgSlug, slug)
        const members = yield* loadMembers(slug)
        yield* syncFrontmatter(
          orgSlug,
          slug,
          indexRow.name,
          indexRow.createdBy,
          indexRow.createdAt,
          file.body,
          members,
          file.github
        )
        return {
          org: orgSlug,
          slug: indexRow.slug,
          name: indexRow.name,
          createdBy: indexRow.createdBy,
          createdAt: indexRow.createdAt,
          github: file.github,
          body: file.body,
          members
        }
      })

    const addMember = (
      orgSlug: string,
      userId: string,
      slug: string,
      input: AddMemberInput
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const target = yield* users.findByEmail(input.email)
        if (target === null) return yield* Effect.fail(new NotFound())

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
            const callerCtx = yield* requireMember(orgSlug, userId, slug)
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

        return yield* replayDetail(orgSlug, slug)
      })

    const updateMember = (
      orgSlug: string,
      userId: string,
      slug: string,
      targetUserId: string,
      nextRole: AssignableRole
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireRole(orgSlug, userId, slug, ["owner"])
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
        return yield* replayDetail(orgSlug, slug)
      })

    const removeMember = (
      orgSlug: string,
      userId: string,
      slug: string,
      targetUserId: string
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        const callerCtx = yield* requireRole(orgSlug, userId, slug, [
          "owner",
          "admin"
        ])
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
        return yield* replayDetail(orgSlug, slug)
      })

    // --- GitHub connection ------------------------------------------

    const connectGithub = (
      orgSlug: string,
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
        yield* requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const indexRow = yield* getIndexRow(orgSlug, slug)
        if (indexRow === null) return yield* Effect.fail(new NotFound())
        const file = yield* readProject(orgSlug, slug)

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
          orgSlug,
          slug,
          indexRow.name,
          indexRow.createdBy,
          indexRow.createdAt,
          file.body,
          members,
          next
        )

        return {
          org: orgSlug,
          slug: indexRow.slug,
          name: indexRow.name,
          createdBy: indexRow.createdBy,
          createdAt: indexRow.createdAt,
          github: next,
          body: file.body,
          members
        }
      })

    const disconnectGithub = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      Effect.gen(function* () {
        yield* requireRole(orgSlug, userId, slug, ["owner", "admin"])
        const indexRow = yield* getIndexRow(orgSlug, slug)
        if (indexRow === null) return yield* Effect.fail(new NotFound())
        const file = yield* readProject(orgSlug, slug)
        const members = yield* loadMembers(slug)
        yield* syncFrontmatter(
          orgSlug,
          slug,
          indexRow.name,
          indexRow.createdBy,
          indexRow.createdAt,
          file.body,
          members,
          null
        )
        return {
          org: orgSlug,
          slug: indexRow.slug,
          name: indexRow.name,
          createdBy: indexRow.createdBy,
          createdAt: indexRow.createdAt,
          github: null,
          body: file.body,
          members
        }
      })

    void inArray
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
