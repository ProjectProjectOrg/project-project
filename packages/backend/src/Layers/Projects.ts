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
import { ulid } from "ulid"
import {
  Conflict,
  Forbidden,
  GitHubError,
  GitHubScopeInsufficient,
  GitHubTokenExpired,
  NotFound,
  paginateSorted,
  ProjectKey,
  RepoGone,
  Role,
  Validation
} from "@projectproject/shared"
import type { CursorPayload } from "@projectproject/shared"
import type {
  AddMemberInput,
  AssignableRole,
  ConnectGithubInput,
  CreateProjectInput,
  GithubConnection,
  Member,
  PendingProjectMember,
  Project,
  ProjectDetail,
  UpdateProjectInput
} from "@projectproject/shared"
import {
  invitation,
  member as orgMember,
  organization,
  projectIndex,
  projectInviteGrant,
  projectMember
} from "../db/schema"
import { Db } from "../Services/Db"
import { GitHub } from "../Services/GitHub"
import { ProjectDocs } from "../Services/ProjectDocs"
import type { MarkdownError } from "../Services/Markdown"
import { TicketDocs } from "../Services/TicketDocs"
import { Users } from "../Services/Users"
import { Projects, type ProjectsShape } from "../Services/Projects"

const MAX_SLUG_ATTEMPTS = 100
const makeRole = Schema.decodeUnknownSync(Role)
const makeAssignableRole = Schema.decodeUnknownSync(
  Schema.Literal("admin", "member")
)
const makeProjectKey = Schema.decodeUnknownSync(ProjectKey)

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

function uniqueConstraint(error: unknown, constraint: string): boolean {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>
    if (record.constraint === constraint) return true
    if (
      typeof record.message === "string" &&
      record.message.includes(constraint)
    ) {
      return true
    }
    return [
      record.cause,
      record.error,
      record.originalError,
      record.cause instanceof Error ? record.cause.cause : undefined
    ].some((value) => uniqueConstraint(value, constraint))
  }
  return typeof error === "string" && error.includes(constraint)
}

export const ProjectsLive = Layer.effect(
  Projects,
  Effect.gen(function* () {
    const db = yield* Db
    const projectDocs = yield* ProjectDocs
    const ticketDocs = yield* TicketDocs
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

    const getIndexRowInOrg = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<typeof projectIndex.$inferSelect, NotFound> =>
      Effect.gen(function* () {
        const organizationId = yield* orgIdFromSlug(orgSlug)
        const row = yield* db.query.projectIndex
          .findFirst({
            where: and(
              eq(projectIndex.slug, slug),
              eq(projectIndex.organizationId, organizationId)
            )
          })
          .pipe(Effect.orDie)
        return row ?? (yield* new NotFound())
      })

    const orgRoleForUser = (
      organizationId: string,
      userId: string
    ): Effect.Effect<Role | null> =>
      db.query.member
        .findFirst({
          columns: { role: true },
          where: and(
            eq(orgMember.organizationId, organizationId),
            eq(orgMember.userId, userId)
          )
        })
        .pipe(
          Effect.map((row) => (row ? makeRole(row.role) : null)),
          Effect.orDie
        )

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

    const loadPendingMembers = (
      slug: string
    ): Effect.Effect<ReadonlyArray<PendingProjectMember>> =>
      db
        .select({
          invitationId: projectInviteGrant.invitationId,
          email: invitation.email,
          role: projectInviteGrant.role,
          expiresAt: invitation.expiresAt
        })
        .from(projectInviteGrant)
        .innerJoin(
          invitation,
          eq(invitation.id, projectInviteGrant.invitationId)
        )
        .where(
          and(
            eq(projectInviteGrant.projectSlug, slug),
            eq(invitation.status, "pending")
          )
        )
        .orderBy(asc(invitation.email))
        .pipe(
          Effect.map((rows) =>
            rows.map((row) => ({
              invitationId: row.invitationId,
              email: row.email,
              role: makeAssignableRole(row.role),
              expiresAt: row.expiresAt
            }))
          ),
          Effect.orDie
        )

    // --- List (member-scoped) ------------------------------------------

    const list = (
      orgSlug: string,
      userId: string
    ): Effect.Effect<ReadonlyArray<Project>, NotFound> =>
      withProjectTelemetry(
        "list",
        orgSlug,
        { userId },
        Effect.gen(function* () {
          const organizationId = yield* orgIdFromSlug(orgSlug)
          const orgRole = yield* orgRoleForUser(organizationId, userId)
          const baseSelect = {
            slug: projectIndex.slug,
            key: projectIndex.key,
            name: projectIndex.name,
            createdBy: projectIndex.createdBy,
            createdAt: projectIndex.createdAt
          }
          const rows =
            orgRole === "owner" || orgRole === "admin"
              ? yield* db
                  .select(baseSelect)
                  .from(projectIndex)
                  .where(eq(projectIndex.organizationId, organizationId))
                  .orderBy(asc(projectIndex.createdAt))
                  .pipe(Effect.orDie)
              : yield* db
                  .select(baseSelect)
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
                  .pipe(Effect.orDie)
          return rows.map((r) => ({
            org: orgSlug,
            slug: r.slug,
            key: makeProjectKey(r.key),
            name: r.name,
            createdBy: r.createdBy,
            createdAt: r.createdAt
          }))
        })
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
    ): Effect.Effect<
      { items: ReadonlyArray<Project>; nextCursor: string | null },
      NotFound
    > =>
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
        Effect.gen(function* () {
          const indexRow = yield* getIndexRowInOrg(orgSlug, slug)
          const explicit = yield* db.query.projectMember
            .findFirst({
              columns: { role: true },
              where: and(
                eq(projectMember.projectSlug, slug),
                eq(projectMember.userId, userId)
              )
            })
            .pipe(Effect.orDie)
          if (explicit) return { role: makeRole(explicit.role) }
          const orgRole = yield* orgRoleForUser(
            indexRow.organizationId ?? "",
            userId
          )
          if (orgRole === "owner" || orgRole === "admin") {
            return { role: "admin" as const }
          }
          return yield* new NotFound()
        })
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

    const getKey = (
      orgSlug: string,
      userId: string,
      slug: string
    ): Effect.Effect<ProjectKey, NotFound> =>
      withProjectTelemetry(
        "getKey",
        orgSlug,
        { slug, userId },
        Effect.gen(function* () {
          yield* requireMember(orgSlug, userId, slug)
          const indexRow = yield* getIndexRowInOrg(orgSlug, slug)
          return yield* Effect.sync(() => makeProjectKey(indexRow.key)).pipe(
            Effect.orDie
          )
        })
      )

    // --- Frontmatter sync ----------------------------------------------

    const syncFrontmatter = (
      orgSlug: string,
      slug: string,
      name: string,
      createdBy: string,
      createdAt: Date,
      key: ProjectKey,
      body: string,
      members: ReadonlyArray<Member>,
      connection: GithubConnection | null
    ): Effect.Effect<void, MarkdownError> =>
      projectDocs.write(orgSlug, slug, {
        org: orgSlug,
        slug,
        key,
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
    ): Effect.Effect<Project, NotFound | Conflict> =>
      withProjectTelemetry(
        "create",
        orgSlug,
        { createdBy, projectName: input.name, projectKey: input.key },
        Effect.gen(function* () {
          const organizationId = yield* orgIdFromSlug(orgSlug)
          const slug = yield* findFreeSlug(slugify(input.name))
          const createdAt = yield* DateTime.nowAsDate
          const key = makeProjectKey(input.key)
          const existingKey = yield* db.query.projectIndex
            .findFirst({
              columns: { slug: true },
              where: and(
                eq(projectIndex.organizationId, organizationId),
                eq(projectIndex.key, input.key)
              )
            })
            .pipe(Effect.orDie)
          if (existingKey) {
            return yield* new Conflict({ reason: "project_key_taken" })
          }

          const [row] = yield* db
            .insert(projectIndex)
            .values({
              slug,
              key,
              name: input.name,
              createdBy,
              createdAt,
              organizationId
            })
            .returning()
            .pipe(
              Effect.catchAll((cause) =>
                uniqueConstraint(cause, "project_index_organization_key_uidx")
                  ? Effect.fail(new Conflict({ reason: "project_key_taken" }))
                  : Effect.die(cause)
              )
            )

          yield* db
            .insert(projectMember)
            .values({
              projectSlug: slug,
              projectId: row.id,
              userId: createdBy,
              role: "owner"
            })
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
            key,
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
            key: makeProjectKey(row.key),
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
          const indexRow = yield* getIndexRowInOrg(orgSlug, slug)
          const file = yield* projectDocs.read(orgSlug, slug)
          const members = yield* loadMembers(slug)
          const pendingMembers = yield* loadPendingMembers(slug)
          const key = makeProjectKey(indexRow.key)
          return {
            org: orgSlug,
            slug: indexRow.slug,
            key,
            name: indexRow.name,
            createdBy: indexRow.createdBy,
            createdAt: indexRow.createdAt,
            github: file.github,
            body: file.body,
            members,
            pendingMembers
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
          const indexRow = yield* getIndexRowInOrg(orgSlug, slug)
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
          const pendingMembers = yield* loadPendingMembers(slug)
          yield* syncFrontmatter(
            orgSlug,
            slug,
            nextName,
            indexRow.createdBy,
            indexRow.createdAt,
            makeProjectKey(indexRow.key),
            nextBody,
            members,
            file.github
          )

          return {
            org: orgSlug,
            slug,
            key: makeProjectKey(indexRow.key),
            name: nextName,
            createdBy: indexRow.createdBy,
            createdAt: indexRow.createdAt,
            github: file.github,
            body: nextBody,
            members,
            pendingMembers
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
        const indexRow = yield* getIndexRowInOrg(orgSlug, slug)
        const file = yield* projectDocs.read(orgSlug, slug)
        const members = yield* loadMembers(slug)
        const pendingMembers = yield* loadPendingMembers(slug)
        yield* syncFrontmatter(
          orgSlug,
          slug,
          indexRow.name,
          indexRow.createdBy,
          indexRow.createdAt,
          makeProjectKey(indexRow.key),
          file.body,
          members,
          file.github
        )
        return {
          org: orgSlug,
          slug: indexRow.slug,
          key: makeProjectKey(indexRow.key),
          name: indexRow.name,
          createdBy: indexRow.createdBy,
          createdAt: indexRow.createdAt,
          github: file.github,
          body: file.body,
          members,
          pendingMembers
        }
      })

    const unassignUserFromActiveTickets = (
      orgSlug: string,
      slug: string,
      userId: string
    ): Effect.Effect<void, MarkdownError> =>
      Effect.gen(function* () {
        const ids = yield* ticketDocs.listIds(orgSlug, slug)
        yield* Effect.forEach(
          ids,
          (id) =>
            Effect.gen(function* () {
              const ticket = yield* ticketDocs.read(orgSlug, slug, id).pipe(
                Effect.catchTag("NotFound", () => Effect.succeed(null)),
                Effect.catchTag("MalformedTicketDocument", (error) =>
                  Effect.logWarning(
                    "Skipping unreadable ticket during unassign",
                    {
                      orgSlug,
                      slug,
                      ticketId: id,
                      error
                    }
                  ).pipe(Effect.as(null))
                )
              )
              if (
                ticket === null ||
                ticket.status === "done" ||
                !ticket.assignees.includes(userId)
              ) {
                return
              }
              yield* ticketDocs.write(orgSlug, slug, id, {
                ...ticket,
                assignees: ticket.assignees.filter((id) => id !== userId),
                updatedAt: yield* DateTime.nowAsDate
              })
            }),
          { concurrency: 8 }
        )
      })

    const attachProjectInviteGrant = (
      orgSlug: string,
      inviterId: string,
      email: string,
      indexRow: typeof projectIndex.$inferSelect,
      role: AssignableRole,
      callerRole: Role
    ): Effect.Effect<void, NotFound | Forbidden> =>
      Effect.gen(function* () {
        const organizationId = yield* orgIdFromSlug(orgSlug)
        const normalizedEmail = email.toLowerCase()
        const now = yield* DateTime.now
        const expiresAt = DateTime.toDate(DateTime.add(now, { hours: 48 }))
        const existing = yield* db.query.invitation
          .findFirst({
            where: and(
              eq(invitation.organizationId, organizationId),
              eq(invitation.email, normalizedEmail),
              eq(invitation.status, "pending")
            )
          })
          .pipe(Effect.orDie)
        const invite =
          existing ??
          (yield* Effect.gen(function* () {
            const id = yield* Effect.sync(() => ulid())
            const [created] = yield* db
              .insert(invitation)
              .values({
                id,
                organizationId,
                email: normalizedEmail,
                role: "member",
                status: "pending",
                expiresAt,
                inviterId
              })
              .returning()
              .pipe(Effect.orDie)
            yield* Effect.sync(() =>
              process.stdout.write(
                `[invitation] org=${orgSlug} email=${normalizedEmail} role=member url=${process.env.BETTER_AUTH_URL}/invite/${created.id}\n`
              )
            )
            return created
          }))

        const existingGrant = yield* db.query.projectInviteGrant
          .findFirst({
            columns: { role: true },
            where: and(
              eq(projectInviteGrant.invitationId, invite.id),
              eq(projectInviteGrant.projectSlug, indexRow.slug)
            )
          })
          .pipe(Effect.orDie)
        if (
          existingGrant &&
          makeAssignableRole(existingGrant.role) !== role &&
          callerRole !== "owner"
        ) {
          return yield* new Forbidden()
        }

        yield* db
          .update(invitation)
          .set({ expiresAt })
          .where(eq(invitation.id, invite.id))
          .pipe(Effect.orDie)

        yield* db
          .insert(projectInviteGrant)
          .values({
            invitationId: invite.id,
            projectSlug: indexRow.slug,
            projectId: indexRow.id,
            role
          })
          .onConflictDoUpdate({
            target: [
              projectInviteGrant.invitationId,
              projectInviteGrant.projectSlug
            ],
            set: { projectId: indexRow.id, role }
          })
          .pipe(Effect.orDie)
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
          const callerCtx = yield* requireRole(orgSlug, userId, slug, [
            "owner",
            "admin"
          ])
          const indexRow = yield* getIndexRowInOrg(orgSlug, slug)
          if (input.role === "admin" && callerCtx.role !== "owner") {
            return yield* new Forbidden()
          }
          const organizationId = yield* orgIdFromSlug(orgSlug)
          const email = input.email.trim().toLowerCase()
          const target = yield* users.findByEmail(email)
          const targetOrgMember =
            target === null
              ? null
              : yield* db.query.member
                  .findFirst({
                    columns: { id: true },
                    where: and(
                      eq(orgMember.organizationId, organizationId),
                      eq(orgMember.userId, target.id)
                    )
                  })
                  .pipe(Effect.orDie)

          if (target === null || targetOrgMember == null) {
            yield* attachProjectInviteGrant(
              orgSlug,
              userId,
              email,
              indexRow,
              input.role,
              callerCtx.role
            )
            return yield* replayDetail(orgSlug, slug)
          }

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
              if (currentRole === "owner") {
                return yield* new Forbidden()
              }
              const callerCtx = yield* requireMember(orgSlug, userId, slug)
              if (callerCtx.role !== "owner") {
                return yield* new Forbidden()
              }
              yield* db
                .update(projectMember)
                .set({ projectId: indexRow.id, role: input.role })
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
                projectId: indexRow.id,
                userId: target.id,
                role: input.role
              })
              .pipe(Effect.orDie)
          }

          return yield* replayDetail(orgSlug, slug)
        })
      )

    const cancelPendingMember = (
      orgSlug: string,
      userId: string,
      slug: string,
      invitationId: string
    ): Effect.Effect<ProjectDetail, NotFound | Forbidden | MarkdownError> =>
      withProjectTelemetry(
        "cancelPendingMember",
        orgSlug,
        { slug, userId, invitationId },
        Effect.gen(function* () {
          const callerCtx = yield* requireRole(orgSlug, userId, slug, [
            "owner",
            "admin"
          ])
          const existing = yield* db
            .select({
              role: projectInviteGrant.role,
              status: invitation.status
            })
            .from(projectInviteGrant)
            .innerJoin(
              invitation,
              eq(invitation.id, projectInviteGrant.invitationId)
            )
            .where(
              and(
                eq(projectInviteGrant.projectSlug, slug),
                eq(projectInviteGrant.invitationId, invitationId)
              )
            )
            .limit(1)
            .pipe(Effect.orDie)
          const pending = existing[0]
          if (!pending || pending.status !== "pending") {
            return yield* new NotFound()
          }
          if (
            makeAssignableRole(pending.role) === "admin" &&
            callerCtx.role !== "owner"
          ) {
            return yield* new Forbidden()
          }
          yield* db
            .delete(projectInviteGrant)
            .where(
              and(
                eq(projectInviteGrant.projectSlug, slug),
                eq(projectInviteGrant.invitationId, invitationId)
              )
            )
            .pipe(Effect.orDie)
          const remaining = yield* db.query.projectInviteGrant
            .findFirst({
              columns: { invitationId: true },
              where: eq(projectInviteGrant.invitationId, invitationId)
            })
            .pipe(Effect.orDie)
          if (!remaining) {
            yield* db
              .update(invitation)
              .set({ status: "canceled" })
              .where(eq(invitation.id, invitationId))
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

    const transferOwnership = (
      orgSlug: string,
      userId: string,
      slug: string,
      targetUserId: string
    ): Effect.Effect<
      ProjectDetail,
      NotFound | Forbidden | Validation | MarkdownError
    > =>
      withProjectTelemetry(
        "transferOwnership",
        orgSlug,
        { slug, userId, targetUserId },
        Effect.gen(function* () {
          const indexRow = yield* getIndexRowInOrg(orgSlug, slug)
          const organizationId = indexRow.organizationId ?? ""
          const callerProjectRole = yield* db.query.projectMember
            .findFirst({
              columns: { role: true },
              where: and(
                eq(projectMember.projectSlug, slug),
                eq(projectMember.userId, userId)
              )
            })
            .pipe(Effect.orDie)
          const callerOrgRole = yield* orgRoleForUser(organizationId, userId)
          const canTransfer =
            callerProjectRole?.role === "owner" || callerOrgRole === "owner"
          if (!canTransfer) return yield* new Forbidden()

          const owners = yield* db.query.projectMember
            .findMany({
              columns: { userId: true },
              where: and(
                eq(projectMember.projectSlug, slug),
                eq(projectMember.role, "owner")
              )
            })
            .pipe(Effect.orDie)
          if (owners.length !== 1) {
            return yield* new Validation({
              reason: "invalid_project_owner_count"
            })
          }
          const sourceUserId = owners[0].userId
          if (targetUserId === sourceUserId) {
            return yield* new Validation({
              reason: "target_is_current_owner"
            })
          }

          const target = yield* db.query.projectMember
            .findFirst({
              columns: { userId: true },
              where: and(
                eq(projectMember.projectSlug, slug),
                eq(projectMember.userId, targetUserId)
              )
            })
            .pipe(Effect.orDie)
          if (!target) return yield* new NotFound()

          yield* db
            .update(projectMember)
            .set({ role: "admin" })
            .where(
              and(
                eq(projectMember.projectSlug, slug),
                eq(projectMember.userId, sourceUserId)
              )
            )
            .pipe(Effect.orDie)
          yield* db
            .update(projectMember)
            .set({ role: "owner" })
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
          yield* unassignUserFromActiveTickets(orgSlug, slug, targetUserId)
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
          const indexRow = yield* getIndexRowInOrg(orgSlug, slug)
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
          const pendingMembers = yield* loadPendingMembers(slug)
          yield* syncFrontmatter(
            orgSlug,
            slug,
            indexRow.name,
            indexRow.createdBy,
            indexRow.createdAt,
            makeProjectKey(indexRow.key),
            file.body,
            members,
            next
          )

          return {
            org: orgSlug,
            slug: indexRow.slug,
            key: makeProjectKey(indexRow.key),
            name: indexRow.name,
            createdBy: indexRow.createdBy,
            createdAt: indexRow.createdAt,
            github: next,
            body: file.body,
            members,
            pendingMembers
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
          const indexRow = yield* getIndexRowInOrg(orgSlug, slug)
          const file = yield* projectDocs.read(orgSlug, slug)
          const members = yield* loadMembers(slug)
          const pendingMembers = yield* loadPendingMembers(slug)
          yield* syncFrontmatter(
            orgSlug,
            slug,
            indexRow.name,
            indexRow.createdBy,
            indexRow.createdAt,
            makeProjectKey(indexRow.key),
            file.body,
            members,
            null
          )
          return {
            org: orgSlug,
            slug: indexRow.slug,
            key: makeProjectKey(indexRow.key),
            name: indexRow.name,
            createdBy: indexRow.createdBy,
            createdAt: indexRow.createdAt,
            github: null,
            body: file.body,
            members,
            pendingMembers
          }
        })
      )

    return {
      list,
      listPaged,
      listMembersPaged,
      create,
      get,
      getKey,
      update,
      remove,
      requireMember,
      requireRole,
      addMember,
      updateMember,
      transferOwnership,
      removeMember,
      cancelPendingMember,
      unassignUserFromActiveTickets,
      connectGithub,
      disconnectGithub
    } satisfies ProjectsShape
  })
)
