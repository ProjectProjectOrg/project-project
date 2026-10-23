import type {
  Forbidden,
  GitHubError,
  GitHubTokenExpired,
  NotFound,
  Slug
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export class GitHubHost extends Context.Service<
  GitHubHost,
  Readonly<{
    userAccessToken: (
      userId: string
    ) => Effect.Effect<string, GitHubTokenExpired>
    installationProject: (
      organizationId: string,
      slug: Slug
    ) => Effect.Effect<Readonly<{ id: string; organizationId: string }> | null>
    requireInstallPermission: (
      organizationId: string,
      userId: string
    ) => Effect.Effect<void, Forbidden>
    installationRedirect: (
      organizationId: string,
      projectId: string | null
    ) => Effect.Effect<string, NotFound | GitHubError>
  }>
>()("@pp/integration-github/Host/GitHubHost") {}
