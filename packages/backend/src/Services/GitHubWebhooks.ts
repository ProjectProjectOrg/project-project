import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

export interface GitHubWebhookDelivery {
  readonly event: string
  readonly deliveryId: string | null
  readonly body: string
}

export interface GitHubWebhookMutationSink {
  readonly installationDeleted: (
    installationId: string,
    deliveryId: string | null
  ) => Effect.Effect<void>
  readonly installationSuspended: (
    installationId: string,
    deliveryId: string | null
  ) => Effect.Effect<void>
  readonly installationUnsuspended: (
    installationId: string,
    deliveryId: string | null
  ) => Effect.Effect<void>
  readonly repositoriesRemoved: (
    installationId: string,
    repoIds: ReadonlyArray<string>,
    deliveryId: string | null
  ) => Effect.Effect<void>
}

export interface GitHubWebhooksShape {
  readonly handle: (delivery: GitHubWebhookDelivery) => Effect.Effect<void>
}

export class GitHubWebhooks extends Context.Tag(
  "@projectproject/backend/Services/GitHubWebhooks"
)<GitHubWebhooks, GitHubWebhooksShape>() {}
