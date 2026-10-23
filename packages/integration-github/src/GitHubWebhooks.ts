import type {
  GitHubError,
  GitHubPullRequestWebhookChange,
  GitHubBranchDeletionChange,
  GitHubCheckWebhookChange,
  GitHubRepositoryMetadataChange
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export type GitHubWebhookHandleError = GitHubError

export type GitHubWebhookDelivery = Readonly<{
  event: string
  deliveryId: string | null
  body: string
}>

export type GitHubWebhookMutationSink = Readonly<{
  installationDeleted: (
    installationId: string,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  installationSuspended: (
    installationId: string,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  installationUnsuspended: (
    installationId: string,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  repositoriesRemoved: (
    installationId: string,
    repoIds: ReadonlyArray<string>,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  repositoryRenamed: (
    change: GitHubRepositoryMetadataChange,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  repositoryTransferred: (
    change: GitHubRepositoryMetadataChange,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  repositoryArchived: (
    installationId: string,
    repoId: string,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  repositoryUnarchived: (
    installationId: string,
    repoId: string,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  repositoryDeleted: (
    installationId: string,
    repoId: string,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  pullRequestChanged: (
    change: GitHubPullRequestWebhookChange,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  branchDeleted: (
    change: GitHubBranchDeletionChange,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  checkStateChanged: (
    change: GitHubCheckWebhookChange,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
}>

export type GitHubWebhooksShape = Readonly<{
  handle: (
    delivery: GitHubWebhookDelivery
  ) => Effect.Effect<void, GitHubWebhookHandleError>
}>

export class GitHubWebhooks extends Context.Service<
  GitHubWebhooks,
  GitHubWebhooksShape
>()("@pp/integration-github/GitHubWebhooks") {}
