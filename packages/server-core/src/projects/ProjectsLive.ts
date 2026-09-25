import {
  BASELINE_STATUS_SEED,
  Conflict,
  deriveProjectIdentity,
  NotFound,
  paginateSorted,
  ProjectColor,
  ProjectIcon,
  LastProjectPmBlocked,
  ProjectKey,
  RepoGone,
  Role,
  UserId,
  OrgScope,
  ProjectScope,
  type ProjectScopeShape
} from "@pp/shared"
import { and, asc, eq, inArray } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { ulid } from "ulid"

const decodeUserId = Schema.decodeSync(UserId)
import { Db } from "@pp/db"
import {
  invitation,
  organizationGithubIntegration,
  organizationIntegration,
  projectGithubRepository,
  projectIndex,
  projectIntegrationLink,
  projectInviteGrant,
  projectMember,
  projectStatus
} from "@pp/db/schema"
import { AssignableRole } from "@pp/shared"
import type {
  GithubConnection,
  Member,
  PendingProjectMember,
  ProjectDetail,
  ProjectSetup
} from "@pp/shared"

import { Access } from "../access/Access"
import { GitHub } from "../github/GitHub"
import type { MarkdownError } from "../markdown/Markdown"
import type {
  MalformedTicketDocument,
  TicketDocument
} from "../tickets/TicketDocs"
import { TicketDocs } from "../tickets/TicketDocs"
import * as TicketDocumentLock from "../tickets/ticketDocumentLock"
import { TicketIndex } from "../tickets/TicketIndex"
import { Users } from "../users/Users"
import { bannerNeedsPlaceholder } from "./bannerPlaceholder"
import { BannerPlaceholders } from "./BannerPlaceholders"
import { ProjectDocs } from "./ProjectDocs"
import {
  iconImageSlots,
  replaceProjectImageReference
} from "./projectImageReferences"
import {
  Projects,
  type ProjectGithubIntegration,
  type ProjectsShape
} from "./Projects"

const MAX_SLUG_ATTEMPTS = 100
const makeRole = Schema.decodeUnknownSync(Role)
const makeAssignableRole = Schema.decodeUnknownSync(AssignableRole)
const makeProjectKey = Schema.decodeUnknownSync(ProjectKey)
const makeProjectIcon = Schema.decodeUnknownSync(ProjectIcon)
const makeProjectColor = Schema.decodeUnknownSync(ProjectColor)
const defaultSetup = (): ProjectSetup => ({
  workflowReviewedAt: null,
  invitePeopleDismissedAt: null,
  connectGithubDismissedAt: null
})

function withProjectTelemetry<A, E, R>(
  operation: string,
  orgSlug: string,
  attributes: Record<string, unknown>,
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> {
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

const presentDetail = (
  scope: ProjectScopeShape,
  detail: Omit<ProjectDetail, "permissions">
): ProjectDetail => ({
  ...detail,
  github: scope.permissions.can({ github: ["read"] }) ? detail.github : null,
  permissions: scope.permissions.grants
})

export const ProjectsLive = Layer.effect(
  Projects,
  Effect.gen(function* () {
    const db = yield* Db
    const access = yield* Access
    const withProjectWriteLock = <A, E, R>(
      projectId: string,
      effect: Effect.Effect<A, E, R>
    ) =>
      db
        .transaction(() =>
          Effect.gen(function* () {
            yield* db
              .select({ id: projectIndex.id })
              .from(projectIndex)
              .where(eq(projectIndex.id, projectId))
              .for("update")
              .pipe(Effect.orDie)
            return yield* effect
          })
        )
        .pipe(Effect.catchTag("SqlError", Effect.die))

    const sql = yield* SqlClient.SqlClient
    const bannerPlaceholders = yield* BannerPlaceholders
    const projectDocs = yield* ProjectDocs
    const ticketDocs = yield* TicketDocs
    const ticketIndex = yield* TicketIndex
    const users = yield* Users
    const github = yield* GitHub
    const ticketDocumentLock = yield* TicketDocumentLock.TicketDocumentLock

    const inScope = Effect.gen(function* () {
      const scope = yield* ProjectScope
      const indexRow = yield* db.query.projectIndex
        .findFirst({ where: { id: scope.projectId } })
        .pipe(Effect.orDie)
      return indexRow ? { scope, indexRow } : yield* new NotFound()
    })

    const findFreeSlug = (
      organizationId: string,
      base: string
    ): Effect.Effect<string> =>
      Effect.gen(function* () {
        const safeBase = base.length > 0 ? base : "project"
        for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++) {
          const candidate = i === 0 ? safeBase : `${safeBase}-${i + 1}`
          const existing = yield* db.query.projectIndex
            .findFirst({
              columns: { slug: true },
              where: {
                RAW: (table, _operators) =>
                  _operators.and(
                    _operators.eq(table.organizationId, organizationId),
                    _operators.eq(table.slug, candidate)
                  )!
              }
            })
            .pipe(Effect.orDie)
          if (!existing) return candidate
        }
        return yield* Effect.die(
          new Error(`could not allocate unique slug for "${base}"`)
        )
      })

    const loadMembers = (
      projectId: string
    ): Effect.Effect<ReadonlyArray<Member>> =>
      db.query.projectMember
        .findMany({
          where: {
            RAW: (table, _operators) =>
              _operators.eq(table.projectId, projectId)
          },
          columns: { roleId: true },
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
                id: decodeUserId(r.user.id),
                username: r.user.username,
                name: r.user.name,
                email: r.user.email,
                image: r.user.image,
                role: makeRole(r.roleId)
              })
            )
          ),
          Effect.orDie
        )

    const loadPendingMembers = (
      projectId: string
    ): Effect.Effect<ReadonlyArray<PendingProjectMember>> =>
      db
        .select({
          invitationId: projectInviteGrant.invitationId,
          email: invitation.email,
          role: projectInviteGrant.roleId,
          expiresAt: invitation.expiresAt
        })
        .from(projectInviteGrant)
        .innerJoin(
          invitation,
          eq(invitation.id, projectInviteGrant.invitationId)
        )
        .where(
          and(
            eq(projectInviteGrant.projectId, projectId),
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

    const loadGithubIntegration = (
      projectId: string
    ): Effect.Effect<ProjectGithubIntegration | null> =>
      db
        .select({
          projectIntegrationLinkId: projectIntegrationLink.id,
          organizationId: projectIntegrationLink.organizationId,
          projectId: projectIntegrationLink.projectId,
          projectSlug: projectIndex.slug,
          installationId: organizationGithubIntegration.installationId,
          repoId: projectGithubRepository.repoId,
          repoOwner: projectGithubRepository.repoOwner,
          repoName: projectGithubRepository.repoName,
          defaultBaseBranch: projectGithubRepository.defaultBranch
        })
        .from(projectIntegrationLink)
        .innerJoin(
          projectIndex,
          eq(projectIndex.id, projectIntegrationLink.projectId)
        )
        .innerJoin(
          projectGithubRepository,
          eq(
            projectGithubRepository.projectIntegrationLinkId,
            projectIntegrationLink.id
          )
        )
        .innerJoin(
          organizationIntegration,
          eq(
            organizationIntegration.id,
            projectIntegrationLink.organizationIntegrationId
          )
        )
        .innerJoin(
          organizationGithubIntegration,
          eq(
            organizationGithubIntegration.organizationIntegrationId,
            organizationIntegration.id
          )
        )
        .where(
          and(
            eq(projectIntegrationLink.projectId, projectId),
            eq(projectIntegrationLink.provider, "github"),
            eq(projectIntegrationLink.status, "active"),
            eq(projectGithubRepository.status, "active"),
            eq(organizationIntegration.status, "active")
          )
        )
        .limit(1)
        .pipe(
          Effect.map((rows) => rows[0] ?? null),
          Effect.orDie
        )

    const loadGithubConnection = (
      indexRow: typeof projectIndex.$inferSelect
    ): Effect.Effect<GithubConnection | null> =>
      loadGithubIntegration(indexRow.id).pipe(
        Effect.map((row) =>
          row === null
            ? null
            : {
                repoId: row.repoId,
                repoOwner: row.repoOwner,
                repoName: row.repoName,
                defaultBaseBranch: row.defaultBaseBranch
              }
        )
      )

    const activeOrganizationGithub = (organizationId: string) =>
      db
        .select({
          integrationId: organizationIntegration.id,
          installationId: organizationGithubIntegration.installationId
        })
        .from(organizationIntegration)
        .innerJoin(
          organizationGithubIntegration,
          eq(
            organizationGithubIntegration.organizationIntegrationId,
            organizationIntegration.id
          )
        )
        .where(
          and(
            eq(organizationIntegration.organizationId, organizationId),
            eq(organizationIntegration.provider, "github"),
            eq(organizationIntegration.status, "active")
          )
        )
        .limit(1)
        .pipe(
          Effect.map((rows) => rows[0] ?? null),
          Effect.orDie
        )

    const list: ProjectsShape["list"] = () =>
      Effect.gen(function* () {
        const { orgSlug, userId } = yield* OrgScope
        return yield* withProjectTelemetry(
          "list",
          orgSlug,
          { userId },
          Effect.gen(function* () {
            const baseSelect = {
              banner: projectIndex.banner,
              iconImage: projectIndex.iconImage,
              slug: projectIndex.slug,
              key: projectIndex.key,
              name: projectIndex.name,
              icon: projectIndex.icon,
              color: projectIndex.color,
              createdBy: projectIndex.createdBy,
              createdAt: projectIndex.createdAt
            }
            const visible = yield* access.projectsInOrg()
            const rows =
              visible.length === 0
                ? []
                : yield* db
                    .select(baseSelect)
                    .from(projectIndex)
                    .where(
                      inArray(
                        projectIndex.id,
                        visible.map((scope) => scope.projectId)
                      )
                    )
                    .orderBy(asc(projectIndex.createdAt))
                    .pipe(Effect.orDie)
            const healable = rows.filter((r) =>
              bannerNeedsPlaceholder(r.banner)
            )
            if (healable.length > 0)
              yield* Effect.forkDetach(
                Effect.forEach(
                  healable,
                  (r) => bannerPlaceholders.ensure(orgSlug, r.slug, r.banner),
                  { concurrency: 2, discard: true }
                )
              )
            return rows.map((r) => ({
              banner: r.banner ?? null,
              iconImage: r.iconImage ?? null,
              org: orgSlug,
              slug: r.slug,
              key: makeProjectKey(r.key),
              name: r.name,
              icon: makeProjectIcon(r.icon),
              color: makeProjectColor(r.color),
              createdBy: r.createdBy,
              createdAt: r.createdAt
            }))
          })
        )
      })

    const projectSortKey = (p: { createdAt: Date; slug: string }) =>
      `${(Number.MAX_SAFE_INTEGER - p.createdAt.getTime())
        .toString()
        .padStart(20, "0")}|${p.slug}`

    const listPaged: ProjectsShape["listPaged"] = (cursor, limit) =>
      Effect.gen(function* () {
        const all = yield* list()
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

    const listMembersPaged: ProjectsShape["listMembersPaged"] = (
      cursor,
      limit
    ) =>
      Effect.gen(function* () {
        const { projectId } = yield* ProjectScope
        const members = yield* loadMembers(projectId)
        const sorted = [...members].toSorted((a, b) =>
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

    const key: ProjectsShape["key"] = () =>
      inScope.pipe(
        Effect.flatMap(({ indexRow }) =>
          Effect.sync(() => makeProjectKey(indexRow.key))
        )
      )

    const githubIntegration: ProjectsShape["githubIntegration"] = () =>
      Effect.flatMap(ProjectScope, (scope) =>
        loadGithubIntegration(scope.projectId)
      )

    const githubBranches: ProjectsShape["githubBranches"] = (query, first) =>
      Effect.gen(function* () {
        const { projectId } = yield* ProjectScope
        const integration = yield* loadGithubIntegration(projectId)
        if (!integration) return { items: [], hasMore: false }
        return yield* github.listInstallationBranches(
          integration.installationId,
          integration.repoOwner,
          integration.repoName,
          query,
          first
        )
      })

    const githubRepos: ProjectsShape["githubRepos"] = (query, page) =>
      Effect.gen(function* () {
        const { organizationId } = yield* ProjectScope
        const installation = yield* activeOrganizationGithub(organizationId)
        if (!installation) return yield* new NotFound()
        return yield* github.listInstallationRepos(
          installation.installationId,
          query,
          page
        )
      })

    const memberIds: ProjectsShape["memberIds"] = () =>
      Effect.flatMap(ProjectScope, (scope) =>
        db.query.projectMember
          .findMany({
            columns: { userId: true },
            where: { projectId: scope.projectId }
          })
          .pipe(
            Effect.map((rows) => new Set(rows.map((row) => row.userId))),
            Effect.orDie
          )
      )

    const syncFrontmatter = (
      orgSlug: string,
      slug: string,
      name: string,
      icon: string,
      color: string,
      createdBy: string,
      createdAt: Date,
      key: ProjectKey,
      body: string,
      connection: GithubConnection | null,
      setup: ProjectSetup
    ): Effect.Effect<void, MarkdownError> =>
      projectDocs.write(orgSlug, slug, {
        org: orgSlug,
        slug,
        key,
        name,
        icon,
        color,
        createdBy,
        createdAt,
        github: connection,
        setup,
        body
      })

    const create: ProjectsShape["create"] = (input) =>
      Effect.gen(function* () {
        const { organizationId, orgSlug, userId: createdBy } = yield* OrgScope
        return yield* withProjectTelemetry(
          "create",
          orgSlug,
          { createdBy, projectName: input.name, projectKey: input.key },
          Effect.gen(function* () {
            const slug = yield* findFreeSlug(
              organizationId,
              slugify(input.name)
            )
            const createdAt = yield* DateTime.nowAsDate
            const key = makeProjectKey(input.key)
            const identityRaw = deriveProjectIdentity(slug)
            const identity = {
              icon: makeProjectIcon(identityRaw.icon),
              color: makeProjectColor(identityRaw.color)
            }
            const existingKey = yield* db.query.projectIndex
              .findFirst({
                columns: { slug: true },
                where: {
                  RAW: (table, _operators) =>
                    _operators.and(
                      _operators.eq(table.organizationId, organizationId),
                      _operators.eq(table.key, input.key)
                    )!
                }
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
                icon: identity.icon,
                color: identity.color,
                createdBy,
                createdAt,
                publishedAt: createdAt,
                organizationId
              })
              .returning()
              .pipe(
                Effect.catch((cause) =>
                  uniqueConstraint(cause, "project_index_organization_key_uidx")
                    ? Effect.fail(new Conflict({ reason: "project_key_taken" }))
                    : Effect.die(cause)
                )
              )

            yield* db
              .insert(projectMember)
              .values({
                projectId: row.id,
                organizationId,
                userId: createdBy,
                roleId: "pm"
              })
              .pipe(Effect.orDie)

            yield* db
              .insert(projectStatus)
              .values(
                BASELINE_STATUS_SEED.map((baseline) => ({
                  projectId: row.id,
                  slug: baseline.slug,
                  label: baseline.label,
                  icon: baseline.icon,
                  color: baseline.color,
                  orderKey: baseline.orderKey,
                  createdBy
                }))
              )
              .pipe(Effect.orDie)

            const rollback = db
              .delete(projectIndex)
              .where(eq(projectIndex.id, row.id))
              .pipe(Effect.orDie)

            yield* syncFrontmatter(
              orgSlug,
              slug,
              input.name,
              identity.icon,
              identity.color,
              createdBy,
              createdAt,
              key,
              `# ${input.name}\n`,
              null,
              defaultSetup()
            ).pipe(
              Effect.catch((cause) =>
                rollback.pipe(Effect.andThen(Effect.die(cause)))
              )
            )

            return {
              org: orgSlug,
              slug: row.slug,
              key: makeProjectKey(row.key),
              name: row.name,
              icon: makeProjectIcon(row.icon),
              color: makeProjectColor(row.color),
              createdBy: row.createdBy,
              createdAt: row.createdAt,
              banner: null,
              iconImage: null
            }
          })
        )
      })

    const get: ProjectsShape["get"] = () =>
      Effect.gen(function* () {
        const { scope, indexRow } = yield* inScope
        const { orgSlug, slug, userId } = scope
        return yield* withProjectTelemetry(
          "get",
          orgSlug,
          { slug, userId },
          Effect.gen(function* () {
            const file = yield* projectDocs.read(orgSlug, slug)
            const members = yield* loadMembers(indexRow.id)
            const pendingMembers = yield* loadPendingMembers(indexRow.id)
            const connection = yield* loadGithubConnection(indexRow)
            const banner = yield* bannerPlaceholders.ensure(
              orgSlug,
              slug,
              indexRow.banner
            )
            const key = makeProjectKey(indexRow.key)
            return presentDetail(scope, {
              org: orgSlug,
              slug: indexRow.slug,
              key,
              name: indexRow.name,
              icon: makeProjectIcon(indexRow.icon),
              color: makeProjectColor(indexRow.color),
              createdBy: indexRow.createdBy,
              createdAt: indexRow.createdAt,
              github: connection,
              banner,
              iconImage: indexRow.iconImage ?? null,
              setup: file.setup,
              body: file.body,
              members,
              pendingMembers
            })
          })
        )
      })

    const update: ProjectsShape["update"] = (input) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug, userId, projectId } = scope
        return yield* withProjectTelemetry(
          "update",
          orgSlug,
          { slug, userId },
          Effect.gen(function* () {
            const { indexRow } = yield* inScope
            const file = yield* projectDocs.read(orgSlug, slug)
            const connection = yield* loadGithubConnection(indexRow)

            const nextBanner =
              input.banner === undefined
                ? (indexRow.banner ?? null)
                : (input.banner ?? null)
            if (input.banner !== undefined) {
              yield* replaceProjectImageReference(db, {
                projectId: indexRow.id,
                slot: "banner",
                attachmentId:
                  nextBanner?.type === "attachment"
                    ? nextBanner.attachmentId
                    : null
              })
            }

            const nextIconImage =
              input.iconImage === undefined
                ? (indexRow.iconImage ?? null)
                : input.iconImage
            if (input.iconImage !== undefined) {
              const slots = iconImageSlots(nextIconImage)
              yield* db.transaction(() =>
                Effect.gen(function* () {
                  yield* replaceProjectImageReference(db, {
                    projectId: indexRow.id,
                    slot: "icon",
                    attachmentId: slots.icon
                  })
                  yield* replaceProjectImageReference(db, {
                    projectId: indexRow.id,
                    slot: "icon_source",
                    attachmentId: slots.iconSource
                  })
                })
              )
            }

            const nextName = input.name ?? indexRow.name
            const nextBody = input.body ?? file.body
            const nextIcon = input.icon ?? makeProjectIcon(indexRow.icon)
            const nextColor = input.color ?? makeProjectColor(indexRow.color)

            const dbPatch: Partial<typeof projectIndex.$inferInsert> = {}
            if (input.banner !== undefined) dbPatch.banner = nextBanner
            if (input.iconImage !== undefined) dbPatch.iconImage = nextIconImage
            if (input.name !== undefined && input.name !== indexRow.name) {
              dbPatch.name = nextName
            }
            if (input.icon !== undefined && input.icon !== indexRow.icon) {
              dbPatch.icon = nextIcon
            }
            if (input.color !== undefined && input.color !== indexRow.color) {
              dbPatch.color = nextColor
            }
            if (Object.keys(dbPatch).length > 0) {
              yield* db
                .update(projectIndex)
                .set(dbPatch)
                .where(eq(projectIndex.id, indexRow.id))
                .pipe(Effect.orDie)
            }

            const members = yield* loadMembers(indexRow.id)
            const pendingMembers = yield* loadPendingMembers(indexRow.id)
            yield* syncFrontmatter(
              orgSlug,
              slug,
              nextName,
              nextIcon,
              nextColor,
              indexRow.createdBy,
              indexRow.createdAt,
              makeProjectKey(indexRow.key),
              nextBody,
              connection,
              file.setup
            )

            return presentDetail(scope, {
              org: orgSlug,
              slug,
              key: makeProjectKey(indexRow.key),
              name: nextName,
              icon: nextIcon,
              color: nextColor,
              createdBy: indexRow.createdBy,
              createdAt: indexRow.createdAt,
              github: connection,
              banner: nextBanner,
              iconImage: nextIconImage,
              setup: file.setup,
              body: nextBody,
              members,
              pendingMembers
            })
          }).pipe((effect) => withProjectWriteLock(projectId, effect))
        )
      })

    const updateSetup: ProjectsShape["updateSetup"] = (input) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const { orgSlug, slug, userId, projectId } = scope
        return yield* withProjectTelemetry(
          "updateSetup",
          orgSlug,
          { slug, userId },
          Effect.gen(function* () {
            const { indexRow } = yield* inScope
            const file = yield* projectDocs.read(orgSlug, slug)
            const connection = yield* loadGithubConnection(indexRow)
            const members = yield* loadMembers(indexRow.id)
            const pendingMembers = yield* loadPendingMembers(indexRow.id)
            const setup = { ...file.setup, ...input }
            yield* syncFrontmatter(
              orgSlug,
              slug,
              indexRow.name,
              indexRow.icon,
              indexRow.color,
              indexRow.createdBy,
              indexRow.createdAt,
              makeProjectKey(indexRow.key),
              file.body,
              connection,
              setup
            )
            return presentDetail(scope, {
              org: orgSlug,
              slug,
              key: makeProjectKey(indexRow.key),
              name: indexRow.name,
              icon: makeProjectIcon(indexRow.icon),
              color: makeProjectColor(indexRow.color),
              createdBy: indexRow.createdBy,
              createdAt: indexRow.createdAt,
              github: connection,
              setup,
              banner: indexRow.banner ?? null,
              iconImage: indexRow.iconImage ?? null,
              body: file.body,
              members,
              pendingMembers
            })
          }).pipe((effect) => withProjectWriteLock(projectId, effect))
        )
      })

    const remove: ProjectsShape["remove"] = () =>
      Effect.gen(function* () {
        const { orgSlug, slug, userId, projectId } = yield* ProjectScope
        yield* withProjectTelemetry(
          "remove",
          orgSlug,
          { slug, userId },
          Effect.gen(function* () {
            yield* projectDocs.removeDir(orgSlug, slug)
            yield* db
              .delete(projectIndex)
              .where(eq(projectIndex.id, projectId))
              .pipe(Effect.orDie)
          })
        )
      })

    const replayDetail = Effect.flatMap(ProjectScope, (current) =>
      withProjectWriteLock(
        current.projectId,
        Effect.gen(function* () {
          const { scope, indexRow } = yield* inScope
          const { orgSlug, slug } = scope
          const file = yield* projectDocs.read(orgSlug, slug)
          const connection = yield* loadGithubConnection(indexRow)
          const members = yield* loadMembers(indexRow.id)
          const pendingMembers = yield* loadPendingMembers(indexRow.id)
          yield* syncFrontmatter(
            orgSlug,
            slug,
            indexRow.name,
            indexRow.icon,
            indexRow.color,
            indexRow.createdBy,
            indexRow.createdAt,
            makeProjectKey(indexRow.key),
            file.body,
            connection,
            file.setup
          )
          return presentDetail(scope, {
            org: orgSlug,
            slug: indexRow.slug,
            key: makeProjectKey(indexRow.key),
            name: indexRow.name,
            icon: makeProjectIcon(indexRow.icon),
            color: makeProjectColor(indexRow.color),
            createdBy: indexRow.createdBy,
            createdAt: indexRow.createdAt,
            github: connection,
            banner: indexRow.banner ?? null,
            iconImage: indexRow.iconImage ?? null,
            setup: file.setup,
            body: file.body,
            members,
            pendingMembers
          })
        })
      )
    )

    const unassignUserFromActiveTickets = (
      orgSlug: string,
      slug: string,
      userId: string
    ): Effect.Effect<void, MarkdownError | MalformedTicketDocument> =>
      Effect.gen(function* () {
        const project = yield* ticketIndex
          .projectFor(orgSlug, slug)
          .pipe(Effect.orDie)
        const tickets = yield* ticketIndex.list(project)
        const ids = tickets
          .filter(
            (ticket) =>
              ticket.status !== "done" && ticket.assignees.includes(userId)
          )
          .map((ticket) => ticket.id)
        yield* Effect.forEach(
          ids,
          (id) =>
            ticketDocs
              .update(
                orgSlug,
                slug,
                id,
                (ticket) => {
                  if (
                    ticket.status === "done" ||
                    !ticket.assignees.includes(userId)
                  ) {
                    return Effect.succeed(ticket)
                  }
                  return DateTime.nowAsDate.pipe(
                    Effect.map((updatedAt) => ({
                      ...ticket,
                      assignees: ticket.assignees.filter((id) => id !== userId),
                      updatedAt
                    }))
                  )
                },
                (next) => ticketIndex.upsertTicket(project, next)
              )
              .pipe(Effect.catchTag("NotFound", () => Effect.succeed(null))),
          { concurrency: 8 }
        )
      })

    const withClearedTicketPrMetadata = <A, E, R>(
      orgSlug: string,
      slug: string,
      switchRepository: Effect.Effect<A, E, R>
    ): Effect.Effect<A, E | MarkdownError, R> =>
      Effect.gen(function* () {
        const project = yield* ticketIndex
          .projectFor(orgSlug, slug)
          .pipe(Effect.orDie)
        const ids = yield* ticketDocs.listIds(orgSlug, slug)
        const originals: Array<TicketDocument> = []
        const clearAndSwitch = Effect.gen(function* () {
          for (const id of ids) {
            const ticket = yield* ticketDocs.read(orgSlug, slug, id).pipe(
              Effect.catchTags({
                NotFound: () => Effect.succeed(null),
                MalformedTicketDocument: (error) =>
                  Effect.logWarning(
                    "Skipping unreadable ticket pr metadata"
                  ).pipe(
                    Effect.annotateLogs({ orgSlug, slug, ticketId: id, error }),
                    Effect.as(null)
                  )
              })
            )
            if (
              ticket === null ||
              (ticket.pr === null &&
                ticket.prState === null &&
                ticket.lastTransitionedPr === null)
            ) {
              continue
            }
            const next = {
              ...ticket,
              pr: null,
              prState: null,
              lastTransitionedPr: null,
              updatedAt: yield* DateTime.nowAsDate
            }
            yield* ticketDocs
              .update(
                orgSlug,
                slug,
                id,
                (current) =>
                  Effect.succeed({
                    ...current,
                    pr: next.pr,
                    prState: next.prState,
                    lastTransitionedPr: next.lastTransitionedPr,
                    updatedAt: next.updatedAt
                  }),
                (updated) =>
                  Effect.gen(function* () {
                    originals.push(ticket)
                    yield* ticketIndex.upsertTicket(project, updated)
                  })
              )
              .pipe(
                Effect.catchTags({
                  NotFound: () => Effect.void,
                  MalformedTicketDocument: (error) =>
                    Effect.logWarning(
                      "Skipping unreadable ticket pr metadata",
                      { orgSlug, slug, ticketId: id, error }
                    )
                })
              )
          }
          return yield* switchRepository
        }).pipe(
          Effect.onError(() =>
            Effect.forEach(
              originals,
              (ticket) =>
                ticketDocs.update(
                  orgSlug,
                  slug,
                  ticket.id,
                  (current) =>
                    Effect.succeed({
                      ...current,
                      pr: ticket.pr,
                      prState: ticket.prState,
                      lastTransitionedPr: ticket.lastTransitionedPr,
                      updatedAt: ticket.updatedAt
                    }),
                  (restored) => ticketIndex.upsertTicket(project, restored)
                ),
              { discard: true }
            ).pipe(Effect.orDie)
          ),
          Effect.uninterruptible
        )
        return yield* [...ids]
          .sort()
          .reduceRight(
            (effect, id) =>
              ticketDocumentLock.withTicketDocumentLock(
                orgSlug,
                slug,
                id,
                effect
              ),
            clearAndSwitch
          )
      })

    const attachProjectInviteGrant = (
      orgSlug: string,
      inviterId: string,
      email: string,
      indexRow: typeof projectIndex.$inferSelect,
      role: AssignableRole
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const organizationId = indexRow.organizationId
        const normalizedEmail = email.toLowerCase()
        const now = yield* DateTime.now
        const expiresAt = DateTime.toDate(DateTime.add(now, { hours: 48 }))
        const existing = yield* db.query.invitation
          .findFirst({
            where: {
              RAW: (table, _operators) =>
                _operators.and(
                  _operators.eq(table.organizationId, organizationId),
                  _operators.eq(table.email, normalizedEmail),
                  _operators.eq(table.status, "pending")
                )!
            }
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
            yield* Effect.logInfo("invitation issued").pipe(
              Effect.annotateLogs({
                orgSlug,
                role: "member",
                inviteId: created.id
              })
            )
            return created
          }))

        yield* db
          .update(invitation)
          .set({ expiresAt })
          .where(eq(invitation.id, invite.id))
          .pipe(Effect.orDie)

        yield* db
          .insert(projectInviteGrant)
          .values({
            invitationId: invite.id,
            projectId: indexRow.id,
            roleId: role
          })
          .onConflictDoUpdate({
            target: [
              projectInviteGrant.invitationId,
              projectInviteGrant.projectId
            ],
            set: { roleId: role }
          })
          .pipe(Effect.orDie)
      })

    const pmCount = (projectId: string): Effect.Effect<number> =>
      db.query.projectMember
        .findMany({
          columns: { userId: true },
          where: {
            RAW: (table, _operators) =>
              _operators.and(
                _operators.eq(table.projectId, projectId),
                _operators.eq(table.roleId, "pm")
              )!
          }
        })
        .pipe(
          Effect.map((rows) => rows.length),
          Effect.orDie
        )

    const memberRole = (
      projectId: string,
      targetUserId: string
    ): Effect.Effect<Role | null> =>
      db.query.projectMember
        .findFirst({
          columns: { roleId: true },
          where: {
            RAW: (table, _operators) =>
              _operators.and(
                _operators.eq(table.projectId, projectId),
                _operators.eq(table.userId, targetUserId)
              )!
          }
        })
        .pipe(
          Effect.map((row) => (row ? makeRole(row.roleId) : null)),
          Effect.orDie
        )

    const requireAnotherPm = (
      indexRow: typeof projectIndex.$inferSelect,
      targetRole: Role
    ): Effect.Effect<void, LastProjectPmBlocked> =>
      Effect.gen(function* () {
        if (targetRole !== "pm") return
        if ((yield* pmCount(indexRow.id)) > 1) return
        return yield* new LastProjectPmBlocked({
          projectSlugs: [indexRow.slug]
        })
      })

    const addMember: ProjectsShape["addMember"] = (input) =>
      Effect.gen(function* () {
        const { orgSlug, slug, userId } = yield* ProjectScope
        return yield* withProjectTelemetry(
          "addMember",
          orgSlug,
          { slug, userId, targetEmail: input.email, targetRole: input.role },
          Effect.gen(function* () {
            const { indexRow } = yield* inScope
            const email = input.email.trim().toLowerCase()
            const target = yield* users.findByEmail(email)
            const targetOrgMember =
              target === null
                ? null
                : yield* db.query.member
                    .findFirst({
                      columns: { id: true },
                      where: {
                        RAW: (table, _operators) =>
                          _operators.and(
                            _operators.eq(
                              table.organizationId,
                              indexRow.organizationId
                            ),
                            _operators.eq(table.userId, target.id)
                          )!
                      }
                    })
                    .pipe(Effect.orDie)

            if (target === null || targetOrgMember == null) {
              yield* attachProjectInviteGrant(
                orgSlug,
                userId,
                email,
                indexRow,
                input.role
              )
              return yield* replayDetail
            }

            yield* withProjectWriteLock(
              indexRow.id,
              Effect.gen(function* () {
                const currentRole = yield* memberRole(indexRow.id, target.id)
                if (currentRole === null) {
                  yield* db
                    .insert(projectMember)
                    .values({
                      projectId: indexRow.id,
                      organizationId: indexRow.organizationId,
                      userId: target.id,
                      roleId: input.role
                    })
                    .pipe(Effect.orDie)
                } else if (currentRole !== input.role) {
                  yield* requireAnotherPm(indexRow, currentRole)
                  yield* db
                    .update(projectMember)
                    .set({ roleId: input.role })
                    .where(
                      and(
                        eq(projectMember.projectId, indexRow.id),
                        eq(projectMember.userId, target.id)
                      )
                    )
                    .pipe(Effect.orDie)
                }
              })
            )

            return yield* replayDetail
          })
        )
      })

    const cancelPendingMember: ProjectsShape["cancelPendingMember"] = (
      invitationId
    ) =>
      Effect.gen(function* () {
        const { orgSlug, slug, userId } = yield* ProjectScope
        return yield* withProjectTelemetry(
          "cancelPendingMember",
          orgSlug,
          { slug, userId, invitationId },
          Effect.gen(function* () {
            const { indexRow } = yield* inScope
            const existing = yield* db
              .select({ status: invitation.status })
              .from(projectInviteGrant)
              .innerJoin(
                invitation,
                eq(invitation.id, projectInviteGrant.invitationId)
              )
              .where(
                and(
                  eq(projectInviteGrant.projectId, indexRow.id),
                  eq(projectInviteGrant.invitationId, invitationId)
                )
              )
              .limit(1)
              .pipe(Effect.orDie)
            const pending = existing[0]
            if (!pending || pending.status !== "pending") {
              return yield* new NotFound()
            }
            yield* db
              .delete(projectInviteGrant)
              .where(
                and(
                  eq(projectInviteGrant.projectId, indexRow.id),
                  eq(projectInviteGrant.invitationId, invitationId)
                )
              )
              .pipe(Effect.orDie)
            const remaining = yield* db.query.projectInviteGrant
              .findFirst({
                columns: { invitationId: true },
                where: {
                  RAW: (table, _operators) =>
                    _operators.eq(table.invitationId, invitationId)
                }
              })
              .pipe(Effect.orDie)
            if (!remaining) {
              yield* db
                .update(invitation)
                .set({ status: "canceled" })
                .where(eq(invitation.id, invitationId))
                .pipe(Effect.orDie)
            }
            return yield* replayDetail
          })
        )
      })

    const updateMember: ProjectsShape["updateMember"] = (
      targetUserId,
      nextRole
    ) =>
      Effect.gen(function* () {
        const { orgSlug, slug, userId } = yield* ProjectScope
        return yield* withProjectTelemetry(
          "updateMember",
          orgSlug,
          { slug, userId, targetUserId, nextRole },
          Effect.gen(function* () {
            const { indexRow } = yield* inScope
            yield* withProjectWriteLock(
              indexRow.id,
              Effect.gen(function* () {
                const currentRole = yield* memberRole(indexRow.id, targetUserId)
                if (currentRole === null) return yield* new NotFound()
                if (currentRole !== nextRole) {
                  yield* requireAnotherPm(indexRow, currentRole)
                }
                yield* db
                  .update(projectMember)
                  .set({ roleId: nextRole })
                  .where(
                    and(
                      eq(projectMember.projectId, indexRow.id),
                      eq(projectMember.userId, targetUserId)
                    )
                  )
                  .pipe(Effect.orDie)
              })
            )
            return yield* replayDetail
          })
        )
      })

    const removeMember: ProjectsShape["removeMember"] = (targetUserId) =>
      Effect.gen(function* () {
        const { orgSlug, slug, userId } = yield* ProjectScope
        return yield* withProjectTelemetry(
          "removeMember",
          orgSlug,
          { slug, userId, targetUserId },
          Effect.gen(function* () {
            const { indexRow } = yield* inScope
            const currentRole = yield* memberRole(indexRow.id, targetUserId)
            if (currentRole === null) return yield* new NotFound()
            yield* requireAnotherPm(indexRow, currentRole)
            yield* unassignUserFromActiveTickets(orgSlug, slug, targetUserId)
            yield* withProjectWriteLock(
              indexRow.id,
              Effect.gen(function* () {
                const lockedRole = yield* memberRole(indexRow.id, targetUserId)
                if (lockedRole === null) return
                yield* requireAnotherPm(indexRow, lockedRole)
                yield* db
                  .delete(projectMember)
                  .where(
                    and(
                      eq(projectMember.projectId, indexRow.id),
                      eq(projectMember.userId, targetUserId)
                    )
                  )
                  .pipe(Effect.orDie)
              })
            )
            return yield* replayDetail
          })
        )
      })

    const connectGithub: ProjectsShape["connectGithub"] = (input) =>
      Effect.gen(function* () {
        const { orgSlug, slug, userId } = yield* ProjectScope
        return yield* withProjectTelemetry(
          "connectGithub",
          orgSlug,
          {
            slug,
            userId,
            repoOwner: input.repoOwner,
            repoName: input.repoName
          },
          Effect.gen(function* () {
            const { indexRow } = yield* inScope
            const orgGithub = yield* activeOrganizationGithub(
              indexRow.organizationId
            )
            if (!orgGithub) return yield* new NotFound()
            const currentConnection = yield* loadGithubConnection(indexRow)

            const verified = yield* github.verifyInstallationRepo(
              orgGithub.installationId,
              input.repoOwner,
              input.repoName
            )
            if (verified.repoId !== input.repoId) {
              return yield* new RepoGone()
            }

            const next: GithubConnection = {
              repoId: verified.repoId,
              repoOwner: verified.owner,
              repoName: verified.name,
              defaultBaseBranch:
                input.defaultBaseBranch === undefined
                  ? verified.defaultBranch
                  : input.defaultBaseBranch
            }

            const now = yield* DateTime.nowAsDate
            const repoChanged =
              currentConnection !== null &&
              (currentConnection.repoId !== next.repoId ||
                currentConnection.repoOwner !== next.repoOwner ||
                currentConnection.repoName !== next.repoName)
            const switchRepository = sql
              .withTransaction(
                Effect.gen(function* () {
                  const activeLinks = yield* db
                    .update(projectIntegrationLink)
                    .set({
                      status: "disconnected",
                      disconnectedAt: now,
                      updatedAt: now
                    })
                    .where(
                      and(
                        eq(projectIntegrationLink.projectId, indexRow.id),
                        eq(projectIntegrationLink.provider, "github"),
                        eq(projectIntegrationLink.status, "active")
                      )
                    )
                    .returning({ id: projectIntegrationLink.id })
                    .pipe(Effect.orDie)

                  yield* Effect.forEach(
                    activeLinks,
                    (link) =>
                      db
                        .update(projectGithubRepository)
                        .set({ status: "disconnected" })
                        .where(
                          eq(
                            projectGithubRepository.projectIntegrationLinkId,
                            link.id
                          )
                        )
                        .pipe(Effect.asVoid, Effect.orDie),
                    { concurrency: 1 }
                  )

                  const [link] = yield* db
                    .insert(projectIntegrationLink)
                    .values({
                      projectId: indexRow.id,
                      organizationId: indexRow.organizationId,
                      organizationIntegrationId: orgGithub.integrationId,
                      provider: "github",
                      status: "active",
                      lastCheckedAt: now,
                      lastCheckStatus: "ok"
                    })
                    .returning()
                    .pipe(
                      Effect.catch((cause) =>
                        uniqueConstraint(
                          cause,
                          "project_integration_link_active_provider_uidx"
                        )
                          ? Effect.fail(
                              new Conflict({
                                reason: "github_repo_already_connected"
                              })
                            )
                          : Effect.die(cause)
                      )
                    )

                  yield* db
                    .insert(projectGithubRepository)
                    .values({
                      projectIntegrationLinkId: link.id,
                      organizationId: indexRow.organizationId,
                      status: "active",
                      repoId: verified.repoId,
                      repoOwner: verified.owner,
                      repoName: verified.name,
                      defaultBranch:
                        next.defaultBaseBranch ?? verified.defaultBranch
                    })
                    .pipe(
                      Effect.catch((cause) =>
                        uniqueConstraint(
                          cause,
                          "project_github_repository_active_repo_uidx"
                        )
                          ? Effect.fail(
                              new Conflict({
                                reason: "github_repo_already_connected"
                              })
                            )
                          : Effect.die(cause)
                      )
                    )
                })
              )
              .pipe(Effect.catchTag("SqlError", Effect.die))

            yield* repoChanged
              ? withClearedTicketPrMetadata(orgSlug, slug, switchRepository)
              : switchRepository

            return yield* replayDetail
          })
        )
      })

    const disconnectGithub: ProjectsShape["disconnectGithub"] = () =>
      Effect.gen(function* () {
        const { orgSlug, slug, userId } = yield* ProjectScope
        return yield* withProjectTelemetry(
          "disconnectGithub",
          orgSlug,
          { slug, userId },
          Effect.gen(function* () {
            const { indexRow } = yield* inScope
            const now = yield* DateTime.nowAsDate
            yield* sql
              .withTransaction(
                Effect.gen(function* () {
                  const activeLinks = yield* db
                    .update(projectIntegrationLink)
                    .set({
                      status: "disconnected",
                      disconnectedAt: now,
                      updatedAt: now
                    })
                    .where(
                      and(
                        eq(projectIntegrationLink.projectId, indexRow.id),
                        eq(projectIntegrationLink.provider, "github"),
                        eq(projectIntegrationLink.status, "active")
                      )
                    )
                    .returning({ id: projectIntegrationLink.id })
                    .pipe(Effect.orDie)
                  yield* Effect.forEach(
                    activeLinks,
                    (link) =>
                      db
                        .update(projectGithubRepository)
                        .set({ status: "disconnected" })
                        .where(
                          eq(
                            projectGithubRepository.projectIntegrationLinkId,
                            link.id
                          )
                        )
                        .pipe(Effect.asVoid, Effect.orDie),
                    { concurrency: 1 }
                  )
                })
              )
              .pipe(Effect.catchTag("SqlError", Effect.die))
            return yield* replayDetail
          })
        )
      })

    return {
      list,
      listPaged,
      listMembersPaged,
      create,
      get,
      key,
      githubIntegration,
      memberIds,
      githubBranches,
      githubRepos,
      update,
      updateSetup,
      remove,
      addMember,
      updateMember,
      removeMember,
      cancelPendingMember,
      unassignUserFromActiveTickets,
      connectGithub,
      disconnectGithub
    } satisfies ProjectsShape
  })
)
