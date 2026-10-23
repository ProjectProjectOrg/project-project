import type {
  GitHubPullRequestWebhookChange,
  GitHubBranchDeletionChange,
  GitHubCheckWebhookChange
} from "@pp/shared"
import * as Context from "effect/Context"
import type * as Effect from "effect/Effect"

import type { MarkdownError } from "../markdown/Markdown"

export type GitHubTicketEventsShape = Readonly<{
  pullRequestChanged: (
    change: GitHubPullRequestWebhookChange,
    deliveryId: string | null
  ) => Effect.Effect<void, MarkdownError>
  branchDeleted: (
    change: GitHubBranchDeletionChange,
    deliveryId: string | null
  ) => Effect.Effect<void, MarkdownError>
  checkStateChanged: (
    change: GitHubCheckWebhookChange,
    deliveryId: string | null
  ) => Effect.Effect<void>
}>
export class GitHubTicketEvents extends Context.Service<
  GitHubTicketEvents,
  GitHubTicketEventsShape
>()("@pp/server-core/github/GitHubTicketEvents") {}
