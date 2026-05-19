import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type { GitHubError } from "@projectproject/shared"

export type GitHubWebhookHandleError = GitHubError

export interface GitHubWebhookDelivery {
  readonly event: string
  readonly deliveryId: string | null
  readonly body: string
}

export interface GitHubWebhookMutationSink {
  readonly installationDeleted: (
    installationId: string,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  readonly installationSuspended: (
    installationId: string,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  readonly installationUnsuspended: (
    installationId: string,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
  readonly repositoriesRemoved: (
    installationId: string,
    repoIds: ReadonlyArray<string>,
    deliveryId: string | null
  ) => Effect.Effect<void, GitHubWebhookHandleError>
}

export interface GitHubWebhooksShape {
  readonly handle: (
    delivery: GitHubWebhookDelivery
  ) => Effect.Effect<void, GitHubWebhookHandleError>
}

export class GitHubWebhooks extends Context.Tag(
  "@projectproject/backend/Services/GitHubWebhooks"
)<GitHubWebhooks, GitHubWebhooksShape>() {}
