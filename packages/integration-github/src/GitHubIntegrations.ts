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

export type GitHubIntegrationsShape = Readonly<{
  getStatus: () => Effect.Effect<GithubOrgIntegrationStatus, never, OrgScope>
  startInstall: (
    returnProjectSlug: Slug | null | undefined
  ) => Effect.Effect<
    Readonly<{ installUrl: string }>,
    NotFound | GitHubError,
    OrgScope
  >
  completeSetup: (
    state: string,
    installationId: string
  ) => Effect.Effect<Readonly<{ authorizeUrl: string }>, NotFound | GitHubError>
  completeCallback: (
    state: string,
    code: string
  ) => Effect.Effect<
    Readonly<{ redirectUrl: string }>,
    NotFound | Forbidden | RateLimited | GitHubError
  >
  listRepos: (
    query: string | undefined,
    page: number
  ) => Effect.Effect<
    GithubRepoPage,
    NotFound | RepoGone | RateLimited | GitHubError,
    OrgScope
  >
}>

export class GitHubIntegrations extends Context.Service<
  GitHubIntegrations,
  GitHubIntegrationsShape
>()("@pp/integration-github/GitHubIntegrations") {}
