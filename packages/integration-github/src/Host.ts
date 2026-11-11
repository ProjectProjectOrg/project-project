import type {
  Forbidden,
  GitHubError,
  GitHubPullRequestWebhookChange,
  GitHubBranchDeletionChange,
  GitHubCheckWebhookChange,
  GitHubTokenExpired,
  NotFound,
  Slug
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export type SealedSecret = Readonly<{
  ciphertext: string
  nonce: string
  tag: string
}>

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
    installationChoiceRedirect: (
      organizationId: string,
      state: string
    ) => Effect.Effect<string, NotFound | GitHubError>
    publicBaseUrl: () => Effect.Effect<string, GitHubError>
    webhookUrl: () => Effect.Effect<string, GitHubError>
    preserveInstallationRepositories: (
      integrationIds: ReadonlyArray<string>
    ) => Effect.Effect<void>
    seal: (plaintext: string) => Effect.Effect<SealedSecret, GitHubError>
    open: (sealed: SealedSecret) => Effect.Effect<string, GitHubError>
    pullRequestChanged: (
      change: GitHubPullRequestWebhookChange,
      deliveryId: string | null
    ) => Effect.Effect<void, GitHubError>
    branchDeleted: (
      change: GitHubBranchDeletionChange,
      deliveryId: string | null
    ) => Effect.Effect<void, GitHubError>
    checkStateChanged: (
      change: GitHubCheckWebhookChange,
      deliveryId: string | null
    ) => Effect.Effect<void, GitHubError>
  }>
>()("@pp/integration-github/Host/GitHubHost") {}
