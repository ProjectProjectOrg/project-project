import { Db } from "@pp/db"
import {
  organizationGithubIntegration,
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
  type GithubConnection,
  type GithubRepoPage,
  type ProjectDetail,
  type RateLimited
} from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"

import * as GitHub from "../github/GitHub"
import type * as Markdown from "../markdown/Markdown"
import * as TicketRewrites from "../tickets/TicketRewrites"
import * as ProjectDetails from "./ProjectDetails"
import { withProjectTelemetry } from "./projectTelemetry"
import { uniqueConstraint } from "./uniqueConstraint"

export interface ProjectGithubIntegration {
  readonly projectIntegrationLinkId: string
  readonly organizationId: string
  readonly projectId: string
  readonly projectSlug: string
  readonly installationId: string
  readonly repoId: string
  readonly repoOwner: string
  readonly repoName: string
  readonly defaultBaseBranch: string
}

export class ProjectGithub extends Context.Service<
  ProjectGithub,
  Readonly<{
    integration: () => Effect.Effect<
      ProjectGithubIntegration | null,
      never,
      ProjectScope
    >
    branches: (
      query: string | undefined,
      first: number,
      after: string | undefined
    ) => Effect.Effect<
      BranchListResponse,
      RepoGone | RateLimited | GitHubError,
      ProjectScope
    >
    repos: (
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
    disconnect: () => Effect.Effect<
      ProjectDetail,
      NotFound | Markdown.MarkdownError,
      ProjectScope
    >
  }>
>()("@pp/server-core/projects/ProjectGithub") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const github = yield* GitHub.GitHub
  const rewrites = yield* TicketRewrites.TicketRewrites
  const {
    current: inScope,
    githubIntegration: loadGithubIntegration,
    githubConnection: loadGithubConnection,
    replay: replayDetail
  } = yield* ProjectDetails.ProjectDetails

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

  const githubIntegration = Effect.fn("ProjectGithub.integration")(
    function* () {
      const scope = yield* ProjectScope
      return yield* loadGithubIntegration(scope.projectId)
    }
  )

  const githubBranches = Effect.fn("ProjectGithub.branches")(function* (
    query: string | undefined,
    first: number,
    after: string | undefined
  ) {
    const { projectId } = yield* ProjectScope
    const integration = yield* loadGithubIntegration(projectId)
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

  const githubRepos = Effect.fn("ProjectGithub.repos")(function* (
    query: string | undefined,
    page: number
  ) {
    const { organizationId } = yield* ProjectScope
    const installation = yield* activeOrganizationGithub(organizationId)
    if (!installation) return yield* new NotFound()
    return yield* github.listInstallationRepos(
      installation.installationId,
      query,
      page
    )
  })

  const connectGithub = Effect.fn("ProjectGithub.connect")(function* (
    input: ConnectGithubInput
  ) {
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
          ? rewrites.withClearedPrMetadata(orgSlug, slug, switchRepository)
          : switchRepository

        return yield* replayDetail
      })
    )
  })

  const disconnectGithub = Effect.fn("ProjectGithub.disconnect")(function* () {
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

  return ProjectGithub.of({
    integration: githubIntegration,
    branches: githubBranches,
    repos: githubRepos,
    connect: connectGithub,
    disconnect: disconnectGithub
  })
})

export const layer = Layer.effect(ProjectGithub, make)
