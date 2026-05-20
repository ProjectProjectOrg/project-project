import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"
import type { GitHubError } from "@projectproject/shared"
import type { MarkdownError } from "./Markdown"

export type GitHubWebhookHandleError = GitHubError | MarkdownError

export interface GitHubWebhookDelivery {
  readonly event: string
  readonly deliveryId: string | null
  readonly body: string
}

export interface GitHubPullRequestWebhookChange {
  readonly installationId: string
  readonly repositoryId: string
  readonly branch: string
  readonly number: number
  readonly state: "open" | "closed" | "merged"
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
  readonly pullRequestChanged: (
    change: GitHubPullRequestWebhookChange,
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
