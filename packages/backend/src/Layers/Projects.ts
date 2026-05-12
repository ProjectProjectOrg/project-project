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

import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { and, asc, eq } from "drizzle-orm"
import {
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  NotFound,
  paginateSorted,
  RepoGone,
  Role
} from "@projectproject/shared"
import type { CursorPayload } from "@projectproject/shared"
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
import { organization, projectIndex, projectMember } from "../db/schema"
import { Db } from "../Services/Db"
import { GitHub } from "../Services/GitHub"
import { ProjectDocs } from "../Services/ProjectDocs"
import type { MarkdownError } from "../Services/Markdown"
import { Users } from "../Services/Users"
import { Projects, type ProjectsShape } from "../Services/Projects"

const MAX_SLUG_ATTEMPTS = 100
const makeRole = Schema.decodeUnknownSync(Role)

function withProjectTelemetry<A, E>(
  operation: string,
  orgSlug: string,
  attributes: Record<string, unknown>,
  effect: Effect.Effect<A, E>
): Effect.Effect<A, E> {
  const annotations = { module: "Projects", operation, orgSlug, ...attributes }
  return effect.pipe(
    Effect.withSpan(`Projects.${operation}`, { attributes: annotations }),
    Effect.annotateLogs(annotations)
  )
}

function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export const ProjectsLive = Layer.effect(
  Projects,
  Effect.gen(function* () {
    const db = yield* Db
    const projectDocs = yield* ProjectDocs
    const users = yield* Users
    const github = yield* GitHub

    // --- DB helpers ----------------------------------------------------

    const orgIdFromSlug = (orgSlug: string): Effect.Effect<string, NotFound> =>
      db.query.organization
        .findFirst({
          columns: { id: true },
          where: eq(organization.slug, orgSlug)
        })
        .pipe(
          Effect.orDie,
          Effect.flatMap((row) =>
            row ? Effect.succeed(row.id) : Effect.fail(new NotFound())
          )
        )

    const getIndexRow = (slug: string) =>
      db.query.projectIndex
        .findFirst({ where: eq(projectIndex.slug, slug) })
        .pipe(Effect.orDie)

    const findFreeSlug = (base: string): Effect.Effect<string> =>
      Effect.gen(function* () {
        const safeBase = base.length > 0 ? base : "project"
        for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++) {
          const candidate = i === 0 ? safeBase : `${safeBase}-${i + 1}`
          const existing = yield* db.query.projectIndex
            .findFirst({
              columns: { slug: true },
              where: eq(projectIndex.slug, candidate)
            })
            .pipe(Effect.orDie)
          if (!existing) return candidate
        }
        return yield* Effect.die(
          new Error(`could not allocate unique slug for "${base}"`)
        )
      })

    const loadMembers = (slug: string): Effect.Effect<ReadonlyArray<Member>> =>
      db.query.projectMember
        .findMany({
          where: eq(projectMember.projectSlug, slug),
          columns: { role: true },
          with: {
            user: {
              columns: {
                id: true,
                username: true,
                name: true,
                email: true,
                image: true
              }
            }
          }
        })
        .pipe(
          Effect.map((rows) =>
            rows.map(
              (r): Member => ({
                id: r.user.id,
                username: r.user.username,
                name: r.user.name,
                email: r.user.email,
                image: r.user.image,
                role: makeRole(r.role)
              })
            )
          ),
          Effect.orDie
        )

    // --- List (member-scoped) ------------------------------------------

    const list = (
      orgSlug: string,
      userId: string
    ): Effect.Effect<ReadonlyArray<Project>> =>
      withProjectTelemetry(
        "list",
        orgSlug,
        { userId },
        db
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
          .orderBy(asc(projectIndex.createdAt))
          .pipe(
            Effect.map((rows) => rows.map((r) => ({ ...r, org: orgSlug }))),
            Effect.orDie
          )
      )

    // --- Paged list ----------------------------------------------------

    const projectSortKey = (p: { createdAt: Date; slug: string }) =>
      `${(Number.MAX_SAFE_INTEGER - p.createdAt.getTime())
        .toString()
        .padStart(20, "0")}|${p.slug}`

    const listPaged = (
      orgSlug: string,
      userId: string,
      cursor: CursorPayload | undefined,
      limit: number
    ): Effect.Effect<{ items: ReadonlyArray<Project>; nextCursor: string | null }> =>
      Effect.gen(function* () {
        const all = yield* list(orgSlug, userId)
        const sorted = [...all].toSorted((a, b) => {
          const dt = b.createdAt.getTime() - a.createdAt.getTime()
          if (dt !== 0) return dt
          return a.slug.localeCompare(b.slug)
        })
        return paginateSorted(sorted, {
          cursor,
          limit,
          sortKey: projectSortKey,
          id: (p) => p.slug
        })
      })

    const listMembersPaged = (
      orgSlug: string,
      userId: string,
      slug: string,
      cursor: CursorPayload | undefined,
      limit: number
    ): Effect.Effect<
      { items: ReadonlyArray<Member>; nextCursor: string | null },
      NotFound
    > =>
      Effect.gen(function* () {
        const detail = yield* get(orgSlug, userId, slug).pipe(
          Effect.catchTag("MarkdownError", (e) => Effect.die(e))
        )
        const sorted = [...detail.members].toSorted((a, b) =>
          a.name < b.name
            ? -1
            : a.name > b.name
              ? 1
              : a.id < b.id
                ? -1
                : a.id > b.id
                  ? 1
                  : 0
        )
        return paginateSorted(sorted, {
          cursor,
          limit,
          sortKey: (m) => m.name,
          id: (m) => m.id
        })
      })

    // --- Permission gates ----------------------------------------------

    const requireMember = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<{ role: Role }, NotFound> =>
      withProjectTelemetry(
        "requireMember",
        orgSlug,
        { slug, userId },
        db.query.projectMember
          .findFirst({
            columns: { role: true },
            where: and(
              eq(projectMember.projectSlug, slug),
              eq(projectMember.userId, userId)
            )
          })
          .pipe(
            Effect.orDie,
            Effect.flatMap((row) =>
              row
                ? Effect.succeed({ role: makeRole(row.role) })
                : Effect.fail(new NotFound())
            )
          )
      )

    const requireRole = (
      orgSlug: string,
      userId: string,
      slug: string,
      allowed: ReadonlyArray<Role>
    ): Effect.Effect<{ role: Role }, NotFound | Forbidden> =>
      Effect.gen(function* () {
        const ctx = yield* requireMember(orgSlug, userId, slug)
        if (!allowed.includes(ctx.role)) {
          return yield* new Forbidden()
        }
        return ctx
      })

    // --- Frontmatter sync ----------------------------------------------

    const syncFrontmatter = (
      orgSlug: string,
      slug: string,
      name: string,
      createdBy: string,
      createdAt: Date,
      body: string,
      members: ReadonlyArray<Member>,
      connection: GithubConnection | null
    ): Effect.Effect<void, MarkdownError> =>
      projectDocs.write(orgSlug, slug, {
        org: orgSlug,
        slug,
        name,
        createdBy,
        createdAt,
        members: members.map((m) => ({
          username: m.username ?? m.email,
          role: m.role
        })),
        github: connection,
        body
      })

    // --- CRUD ----------------------------------------------------------

    const create = (
      orgSlug: string,
      createdBy: string,
      input: CreateProjectInput
    ): Effect.Effect<Project, NotFound> =>
      withProjectTelemetry(
        "create",
        orgSlug,
        { createdBy, projectName: input.name },
        Effect.gen(function* () {
          const organizationId = yield* orgIdFromSlug(orgSlug)
          const slug = yield* findFreeSlug(slugify(input.name))
          const createdAt = yield* DateTime.nowAsDate

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
      )

    const get = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<ProjectDetail, NotFound | MarkdownError> =>
      withProjectTelemetry(
        "get",
        orgSlug,
        { slug, userId },
        Effect.gen(function* () {
          yield* requireMember(orgSlug, userId, slug)
          const indexRow = yield* getIndexRow(slug)
          if (!indexRow) return yield* new NotFound()
          const file = yield* projectDocs.read(orgSlug, slug)
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
      )

    const update = (
      orgSlug: string,
      userId: string,
      slug: string,
      input: UpdateProjectInput
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      withProjectTelemetry(
        "update",
        orgSlug,
        { slug, userId },
        Effect.gen(function* () {
          yield* requireRole(orgSlug, userId, slug, ["owner", "admin"])
          const indexRow = yield* getIndexRow(slug)
          if (!indexRow) return yield* new NotFound()
          const file = yield* projectDocs.read(orgSlug, slug)

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
      )

    const remove = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<void, NotFound | Forbidden | MarkdownError> =>
      withProjectTelemetry(
        "remove",
        orgSlug,
        { slug, userId },
        Effect.gen(function* () {
          yield* requireRole(orgSlug, userId, slug, ["owner"])
          yield* projectDocs.removeDir(orgSlug, slug)
          yield* db
            .delete(projectIndex)
            .where(eq(projectIndex.slug, slug))
            .pipe(Effect.orDie)
        })
      )

    // --- Member management ---------------------------------------------

    const replayDetail = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<ProjectDetail, NotFound | MarkdownError> =>
      Effect.gen(function* () {
        const indexRow = yield* getIndexRow(slug)
        if (!indexRow) return yield* new NotFound()
        const file = yield* projectDocs.read(orgSlug, slug)
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
      withProjectTelemetry(
        "addMember",
        orgSlug,
        { slug, userId, targetEmail: input.email, targetRole: input.role },
        Effect.gen(function* () {
          yield* requireRole(orgSlug, userId, slug, ["owner", "admin"])
          const target = yield* users.findByEmail(input.email)
          if (target === null) return yield* new NotFound()

          const existing = yield* db.query.projectMember
            .findFirst({
              columns: { role: true },
              where: and(
                eq(projectMember.projectSlug, slug),
                eq(projectMember.userId, target.id)
              )
            })
            .pipe(Effect.orDie)

          if (existing) {
            const currentRole = makeRole(existing.role)
            if (currentRole !== input.role) {
              const callerCtx = yield* requireMember(orgSlug, userId, slug)
              if (callerCtx.role !== "owner") {
                return yield* new Forbidden()
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
      )

    const updateMember = (
      orgSlug: string,
      userId: string,
      slug: string,
      targetUserId: string,
      nextRole: AssignableRole
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      withProjectTelemetry(
        "updateMember",
        orgSlug,
        { slug, userId, targetUserId, nextRole },
        Effect.gen(function* () {
          yield* requireRole(orgSlug, userId, slug, ["owner"])
          const existing = yield* db.query.projectMember
            .findFirst({
              columns: { role: true },
              where: and(
                eq(projectMember.projectSlug, slug),
                eq(projectMember.userId, targetUserId)
              )
            })
            .pipe(Effect.orDie)
          if (!existing) return yield* new NotFound()
          if (makeRole(existing.role) === "owner") {
            return yield* new Forbidden()
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
      )

    const removeMember = (
      orgSlug: string,
      userId: string,
      slug: string,
      targetUserId: string
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      withProjectTelemetry(
        "removeMember",
        orgSlug,
        { slug, userId, targetUserId },
        Effect.gen(function* () {
          const callerCtx = yield* requireRole(orgSlug, userId, slug, [
            "owner",
            "admin"
          ])
          const existing = yield* db.query.projectMember
            .findFirst({
              columns: { role: true },
              where: and(
                eq(projectMember.projectSlug, slug),
                eq(projectMember.userId, targetUserId)
              )
            })
            .pipe(Effect.orDie)
          if (!existing) return yield* new NotFound()
          const targetRole = makeRole(existing.role)
          if (targetRole === "owner") return yield* new Forbidden()
          if (targetRole === "admin" && callerCtx.role !== "owner") {
            return yield* new Forbidden()
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
      )

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
      withProjectTelemetry(
        "connectGithub",
        orgSlug,
        {
          slug,
          userId,
          repoOwner: input.repoOwner,
          repoName: input.repoName
        },
        Effect.gen(function* () {
          yield* requireRole(orgSlug, userId, slug, ["owner", "admin"])
          const indexRow = yield* getIndexRow(slug)
          if (!indexRow) return yield* new NotFound()
          const file = yield* projectDocs.read(orgSlug, slug)

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
      )

    const disconnectGithub = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      withProjectTelemetry(
        "disconnectGithub",
        orgSlug,
        { slug, userId },
        Effect.gen(function* () {
          yield* requireRole(orgSlug, userId, slug, ["owner", "admin"])
          const indexRow = yield* getIndexRow(slug)
          if (!indexRow) return yield* new NotFound()
          const file = yield* projectDocs.read(orgSlug, slug)
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
      )

    return {
      list,
      listPaged,
      listMembersPaged,
      create,
      get,
      update,
      remove,
      requireMember,
      requireRole,
      addMember,
      updateMember,
      removeMember,
      connectGithub,
      disconnectGithub
    } satisfies ProjectsShape
  })
)
