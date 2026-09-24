import type {
  Forbidden,
  GitHubError,
  GithubOrgIntegrationStatus,
  GithubRepoPage,
  NotFound,
  OrgScope,
  RateLimited,
  RepoGone,
  Slug
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export interface GitHubIntegrationsShape {
  readonly getStatus: () => Effect.Effect<
    GithubOrgIntegrationStatus,
    never,
    OrgScope
  >
  readonly startInstall: (
    returnProjectSlug: Slug | null | undefined
  ) => Effect.Effect<{ installUrl: string }, NotFound | GitHubError, OrgScope>
  readonly completeSetup: (
    state: string,
    installationId: string
  ) => Effect.Effect<{ authorizeUrl: string }, NotFound | GitHubError>
  readonly completeCallback: (
    state: string,
    code: string
  ) => Effect.Effect<
    { redirectUrl: string },
    NotFound | Forbidden | RateLimited | GitHubError
  >
  readonly listRepos: (
    query: string | undefined,
    page: number
  ) => Effect.Effect<
    GithubRepoPage,
    NotFound | RepoGone | RateLimited | GitHubError,
    OrgScope
  >
}

export class GitHubIntegrations extends Context.Service<
  GitHubIntegrations,
  GitHubIntegrationsShape
>()("@pp/server-core/github/GitHubIntegrations") {}
