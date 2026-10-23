import * as Layer from "effect/Layer"

import { GitHubIntegrationsLive } from "./GitHubIntegrationsLive"
import { GitHubLive } from "./GitHubLive"
import { GitHubWebhooksLive } from "./GitHubWebhooksLive"

export const GitHubServicesLive = Layer.mergeAll(
  GitHubIntegrationsLive,
  GitHubWebhooksLive
).pipe(Layer.provideMerge(GitHubLive))
