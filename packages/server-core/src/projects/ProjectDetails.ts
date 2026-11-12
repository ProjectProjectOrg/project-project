import { Effective, Project } from "@pp/access/roles"
import { Db } from "@pp/db"
import {
  invitation,
  organizationGithubIntegration,
  organizationIntegration,
  projectGithubRepository,
  projectIndex,
  projectIntegrationLink,
  projectInviteGrant
} from "@pp/db/schema"
import {
  AssignableRole,
  NotFound,
  ProjectColor,
  ProjectIcon,
  ProjectKey,
  ProjectScope,
  Role,
  UserId,
  type EstimationMode,
  type GithubConnection,
  type Member,
  type PendingProjectMember,
  type ProjectDetail,
  type ProjectSetup
} from "@pp/shared"
import { and, asc, eq, gt } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import type * as ProjectGithub from "../github/ProjectGithub"
import type * as Markdown from "../markdown/Markdown"
import * as ProjectDocs from "./ProjectDocs"
import { readProjectDocument } from "./readProjectDocument"

const decodeUserId = Schema.decodeSync(UserId)
const makeRole = Schema.decodeUnknownSync(Role)
const makeAssignableRole = Schema.decodeUnknownSync(AssignableRole)
const makeProjectKey = Schema.decodeUnknownSync(ProjectKey)
const makeProjectIcon = Schema.decodeUnknownSync(ProjectIcon)
const makeProjectColor = Schema.decodeUnknownSync(ProjectColor)

type ProjectIndexRow = typeof projectIndex.$inferSelect

export const presentDetail = (
  scope: ProjectScope["Service"],
  detail: Omit<ProjectDetail, "permissions" | "github" | "githubRepos"> &
    Readonly<{ github: ReadonlyArray<GithubConnection> }>
): ProjectDetail => ({
  ...detail,
  github: scope.permissions.can({ github: ["read"] })
    ? (detail.github[0] ?? null)
    : null,
  githubRepos: scope.permissions.can({ github: ["read"] }) ? detail.github : [],
  pendingMembers: scope.permissions.can({ members: ["manage"] })
    ? detail.pendingMembers
    : [],
  permissions: scope.permissions.grants
})

const rescoped = (
  scope: ProjectScope["Service"],
  members: ReadonlyArray<Member>
): ProjectScope["Service"] => {
  const role =
    members.find((candidate) => candidate.id === scope.userId)?.role ?? null
  return {
    ...scope,
    role,
    permissions: Effective.roleOnProject(scope.orgRole, role).pipe(
      Option.getOrElse(() => Project.projectStatement.role({}))
    )
  }
}

export class ProjectDetails extends Context.Service<
  ProjectDetails,
  Readonly<{
    withWriteLock: <A, E, R>(
      projectId: string,
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, Exclude<E, Readonly<{ _tag: "SqlError" }>>, R>
    current: Effect.Effect<
      Readonly<{ scope: ProjectScope["Service"]; indexRow: ProjectIndexRow }>,
      NotFound,
      ProjectScope
    >
    members: (projectId: string) => Effect.Effect<ReadonlyArray<Member>>
    pendingMembers: (
      projectId: string
    ) => Effect.Effect<ReadonlyArray<PendingProjectMember>>
    githubIntegrations: (
      projectId: string
    ) => Effect.Effect<ReadonlyArray<ProjectGithub.ProjectGithubIntegration>>
    githubConnection: (
      indexRow: ProjectIndexRow
    ) => Effect.Effect<ReadonlyArray<GithubConnection>>
    writeFrontmatter: (
      orgSlug: string,
      slug: string,
      name: string,
      icon: string,
      color: string,
      createdBy: string,
      createdAt: Date,
      key: ProjectKey,
      body: string,
      connection: ReadonlyArray<GithubConnection>,
      setup: ProjectSetup,
      estimation: EstimationMode
    ) => Effect.Effect<void, Markdown.MarkdownError>
    replay: Effect.Effect<
      ProjectDetail,
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
  }>
>()("@pp/server-core/projects/ProjectDetails") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const projectDocs = yield* ProjectDocs.ProjectDocs

  const withProjectWriteLock = Effect.fn("ProjectDetails.withWriteLock")(
    function* <A, E, R>(projectId: string, effect: Effect.Effect<A, E, R>) {
      return yield* db
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
    }
  )

  const inScope = Effect.gen(function* () {
    const scope = yield* ProjectScope
    const indexRow = yield* db.query.projectIndex
      .findFirst({ where: { id: scope.projectId } })
      .pipe(Effect.orDie)
    return indexRow ? { scope, indexRow } : yield* new NotFound()
  })

  const loadMembers = Effect.fn("ProjectDetails.members")(function* (
    projectId: string
  ) {
    return yield* db.query.projectMember
      .findMany({
        where: {
          RAW: (table, _operators) => _operators.eq(table.projectId, projectId)
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
  })

  const loadPendingMembers = Effect.fn("ProjectDetails.pendingMembers")(
    function* (projectId: string) {
      return yield* DateTime.nowAsDate.pipe(
        Effect.flatMap((now) =>
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
                eq(invitation.status, "pending"),
                gt(invitation.expiresAt, now)
              )
            )
            .orderBy(asc(invitation.email))
        ),
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
    }
  )

  const loadGithubIntegrations = Effect.fn("ProjectDetails.githubIntegrations")(
    function* (projectId: string) {
      return yield* db
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
        .orderBy(
          asc(projectIntegrationLink.connectedAt),
          asc(projectIntegrationLink.id)
        )
        .pipe(
          Effect.map((rows) =>
            rows.map((row, position) => ({ ...row, isDefault: position === 0 }))
          ),
          Effect.orDie
        )
    }
  )

  const loadGithubConnection = Effect.fn("ProjectDetails.githubConnection")(
    function* (indexRow: typeof projectIndex.$inferSelect) {
      return yield* loadGithubIntegrations(indexRow.id).pipe(
        Effect.map((rows) =>
          rows.map((row) => ({
            repoId: row.repoId,
            repoOwner: row.repoOwner,
            repoName: row.repoName,
            defaultBaseBranch: row.defaultBaseBranch
          }))
        )
      )
    }
  )

  const syncFrontmatter = Effect.fn("ProjectDetails.writeFrontmatter")(
    function* (
      orgSlug: string,
      slug: string,
      name: string,
      icon: string,
      color: string,
      createdBy: string,
      createdAt: Date,
      key: ProjectKey,
      body: string,
      connection: ReadonlyArray<GithubConnection>,
      setup: ProjectSetup,
      estimation: EstimationMode
    ) {
      return yield* projectDocs.write(orgSlug, slug, {
        org: orgSlug,
        slug,
        key,
        name,
        icon,
        color,
        createdBy,
        createdAt,
        github: connection[0] ?? null,
        githubRepos: connection,
        estimation,
        setup,
        body
      })
    }
  )

  const replayDetail = Effect.flatMap(ProjectScope, (current) =>
    withProjectWriteLock(
      current.projectId,
      Effect.gen(function* () {
        const { scope, indexRow } = yield* inScope
        const { orgSlug, slug } = scope
        const file = yield* readProjectDocument({
          db,
          docs: projectDocs,
          project: scope,
          indexed: indexRow
        })
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
          file.setup,
          file.estimation
        )
        return presentDetail(rescoped(scope, members), {
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
          estimation: file.estimation,
          body: file.body,
          nextTicketNumber: indexRow.nextTicketNumber,
          members,
          pendingMembers
        })
      })
    )
  )

  return ProjectDetails.of({
    withWriteLock: withProjectWriteLock,
    current: inScope,
    members: loadMembers,
    pendingMembers: loadPendingMembers,
    githubIntegrations: loadGithubIntegrations,
    githubConnection: loadGithubConnection,
    writeFrontmatter: syncFrontmatter,
    replay: replayDetail
  })
})

export const layer = Layer.effect(ProjectDetails, make)
