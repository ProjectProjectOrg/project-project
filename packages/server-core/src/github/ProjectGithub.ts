import { Db } from "@pp/db"
import {
  organizationGithubIntegration,
  organizationGithubIntegrationProject,
  organizationIntegration,
  projectGithubRepository,
  projectIntegrationLink
} from "@pp/db/schema"
import {
  Conflict,
  NotFound,
  ProjectScope,
  RepoGone,
  type ActivityActor,
  type BranchListResponse,
  type ConnectGithubInput,
  type GitHubError,
  type GitHubScopeInsufficient,
  type GitHubTokenExpired,
  type GithubRepoPage,
  type ProjectDetail,
  type ProjectGithubInstallation,
  type RateLimited
} from "@pp/shared"
import { and, asc, eq, exists, or } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"

import type * as Markdown from "../markdown/Markdown"
import * as ProjectDetails from "../projects/ProjectDetails"
import { annotateProjectTelemetry } from "../projects/projectTelemetry"
import { uniqueConstraint } from "../projects/uniqueConstraint"
import * as TicketRewrites from "../tickets/TicketRewrites"
import * as GitHub from "./GitHub"
import { legacyRepositoryForProject } from "./repositoryBackfill"

export type ProjectGithubIntegration = Readonly<{
  projectIntegrationLinkId: string
  organizationId: string
  projectId: string
  projectSlug: string
  installationId: string
  repoId: string
  repoOwner: string
  repoName: string
  defaultBaseBranch: string
  isDefault: boolean
}>

export const integrationForRepo = (
  integrations: ReadonlyArray<ProjectGithubIntegration>,
  repoId: string | null | undefined
): ProjectGithubIntegration | null =>
  (repoId == null
    ? integrations.find((integration) => integration.isDefault)
    : integrations.find((integration) => integration.repoId === repoId)) ?? null

export class ProjectGithub extends Context.Service<
  ProjectGithub,
  Readonly<{
    integration: () => Effect.Effect<
      ProjectGithubIntegration | null,
      never,
      ProjectScope
    >
    integrations: () => Effect.Effect<
      ReadonlyArray<ProjectGithubIntegration>,
      never,
      ProjectScope
    >
    branches: (
      repoId: string | undefined,
      query: string | undefined,
      first: number,
      after: string | undefined
    ) => Effect.Effect<
      BranchListResponse,
      RepoGone | RateLimited | GitHubError,
      ProjectScope
    >
    installations: () => Effect.Effect<
      ReadonlyArray<ProjectGithubInstallation>,
      never,
      ProjectScope
    >
    repos: (
      installationId: string | undefined,
      query: string | undefined,
      page: number
    ) => Effect.Effect<
      GithubRepoPage,
      NotFound | RepoGone | RateLimited | GitHubError,
      ProjectScope
    >
    connect: (
      input: ConnectGithubInput
    ) => Effect.Effect<
      ProjectDetail,
      | NotFound
      | Conflict
      | GitHubTokenExpired
      | GitHubScopeInsufficient
      | RepoGone
      | RateLimited
      | GitHubError
      | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
    disconnect: (
      repoId: string
    ) => Effect.Effect<
      ProjectDetail,
      NotFound | Markdown.MarkdownError,
      ProjectScope | ActivityActor
    >
  }>
>()("@pp/server-core/github/ProjectGithub") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const github = yield* GitHub.GitHub
  const rewrites = yield* TicketRewrites.TicketRewrites
  const {
    current: inScope,
    githubIntegrations: loadGithubIntegrations,
    replay: replayDetail
  } = yield* ProjectDetails.ProjectDetails

  const availableInstallations = (organizationId: string, projectId: string) =>
    db
      .select({
        integrationId: organizationIntegration.id,
        installationId: organizationGithubIntegration.installationId,
        accountLogin: organizationGithubIntegration.githubAccountLogin,
        accountType: organizationGithubIntegration.githubAccountType
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
          eq(organizationIntegration.status, "active"),
          or(
            eq(organizationGithubIntegration.projectAccess, "all"),
            exists(
              db
                .select({
                  projectId: organizationGithubIntegrationProject.projectId
                })
                .from(organizationGithubIntegrationProject)
                .where(
                  and(
                    eq(
                      organizationGithubIntegrationProject.organizationIntegrationId,
                      organizationIntegration.id
                    ),
                    eq(
                      organizationGithubIntegrationProject.projectId,
                      projectId
                    )
                  )
                )
            )
          )
        )
      )
      .orderBy(asc(organizationIntegration.connectedAt))
      .pipe(Effect.orDie)

  const githubIntegrations = Effect.fn("ProjectGithub.integrations")(
    function* () {
      const scope = yield* ProjectScope
      return yield* loadGithubIntegrations(scope.projectId)
    }
  )

  const githubIntegration = Effect.fn("ProjectGithub.integration")(
    function* () {
      return integrationForRepo(yield* githubIntegrations(), null)
    }
  )

  const githubBranches = Effect.fn("ProjectGithub.branches")(function* (
    repoId: string | undefined,
    query: string | undefined,
    first: number,
    after: string | undefined
  ) {
    const integration = integrationForRepo(yield* githubIntegrations(), repoId)
    if (!integration) return { items: [], nextCursor: null, totalCount: 0 }
    return yield* github.listInstallationBranches(
      integration.installationId,
      integration.repoOwner,
      integration.repoName,
      query,
      first,
      after
    )
  })

  const githubInstallations = Effect.fn("ProjectGithub.installations")(
    function* () {
      const { organizationId, projectId } = yield* ProjectScope
      const rows = yield* availableInstallations(organizationId, projectId)
      return rows.map((row) => ({
        id: row.integrationId,
        accountLogin: row.accountLogin,
        accountType: row.accountType
      }))
    }
  )

  const githubRepos = Effect.fn("ProjectGithub.repos")(function* (
    installationId: string | undefined,
    query: string | undefined,
    page: number
  ) {
    const { organizationId, projectId } = yield* ProjectScope
    const rows = yield* availableInstallations(organizationId, projectId)
    const installation =
      installationId === undefined
        ? rows[0]
        : rows.find((row) => row.integrationId === installationId)
    if (!installation) return yield* new NotFound()
    return yield* github.listInstallationRepos(
      installation.installationId,
      query,
      page
    )
  })

  const disconnectLink = (linkId: string, now: Date) =>
    sql
      .withTransaction(
        Effect.gen(function* () {
          yield* db
            .update(projectIntegrationLink)
            .set({
              status: "disconnected",
              disconnectedAt: now,
              updatedAt: now
            })
            .where(eq(projectIntegrationLink.id, linkId))
            .pipe(Effect.orDie)
          yield* db
            .update(projectGithubRepository)
            .set({ status: "disconnected" })
            .where(eq(projectGithubRepository.projectIntegrationLinkId, linkId))
            .pipe(Effect.orDie)
        })
      )
      .pipe(Effect.catchTag("SqlError", Effect.die))

  const connectGithub = Effect.fn("ProjectGithub.connect")(function* (
    input: ConnectGithubInput
  ) {
    const { orgSlug, slug, userId } = yield* ProjectScope
    return yield* annotateProjectTelemetry(
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
        const connected = yield* loadGithubIntegrations(indexRow.id)
        const current = connected.find(
          (integration) => integration.repoId === input.repoId
        )
        if (current) {
          const verified = yield* github.verifyInstallationRepo(
            current.installationId,
            input.repoOwner,
            input.repoName
          )
          if (verified.repoId !== input.repoId) return yield* new RepoGone()
          yield* db
            .update(projectGithubRepository)
            .set({
              repoOwner: verified.owner,
              repoName: verified.name,
              defaultBranch: input.defaultBaseBranch ?? verified.defaultBranch
            })
            .where(
              eq(
                projectGithubRepository.projectIntegrationLinkId,
                current.projectIntegrationLinkId
              )
            )
            .pipe(Effect.orDie)
          return yield* replayDetail
        }

        const available = yield* availableInstallations(
          indexRow.organizationId,
          indexRow.id
        )
        if (available.length === 0) return yield* new NotFound()
        const orgGithub =
          input.installationId === undefined
            ? available.length === 1
              ? available[0]
              : undefined
            : available.find(
                (installation) =>
                  installation.integrationId === input.installationId
              )
        if (!orgGithub) {
          return yield* new Conflict({
            reason: "github_installation_not_available"
          })
        }

        const verified = yield* github.verifyInstallationRepo(
          orgGithub.installationId,
          input.repoOwner,
          input.repoName
        )
        if (verified.repoId !== input.repoId) {
          return yield* new RepoGone()
        }

        const defaultRepo = yield* legacyRepositoryForProject(indexRow.id).pipe(
          Effect.provideService(Db, db)
        )
        if (defaultRepo) {
          yield* rewrites.stampRepository(orgSlug, slug, defaultRepo.repoId)
        }

        const now = yield* DateTime.nowAsDate
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
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
                .pipe(Effect.orDie)

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
                    input.defaultBaseBranch ?? verified.defaultBranch
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

        return yield* replayDetail
      })
    )
  })

  const disconnectGithub = Effect.fn("ProjectGithub.disconnect")(function* (
    repoId: string
  ) {
    const { orgSlug, slug, userId } = yield* ProjectScope
    return yield* annotateProjectTelemetry(
      "disconnectGithub",
      orgSlug,
      { slug, userId },
      Effect.gen(function* () {
        const { indexRow } = yield* inScope
        const connected = yield* loadGithubIntegrations(indexRow.id)
        const current = connected.find(
          (integration) => integration.repoId === repoId
        )
        if (!current) return yield* new NotFound()
        if (current.isDefault) {
          const legacy = yield* legacyRepositoryForProject(indexRow.id).pipe(
            Effect.provideService(Db, db)
          )
          if (legacy) {
            yield* rewrites.stampRepository(orgSlug, slug, legacy.repoId)
          }
        }
        yield* disconnectLink(
          current.projectIntegrationLinkId,
          yield* DateTime.nowAsDate
        )
        return yield* replayDetail
      })
    )
  })

  return ProjectGithub.of({
    integration: githubIntegration,
    integrations: githubIntegrations,
    branches: githubBranches,
    installations: githubInstallations,
    repos: githubRepos,
    connect: connectGithub,
    disconnect: disconnectGithub
  })
})

export const layer = Layer.effect(ProjectGithub, make)
