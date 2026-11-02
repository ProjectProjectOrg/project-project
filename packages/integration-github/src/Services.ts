import * as Layer from "effect/Layer"

import * as GitHub from "./GitHub"
import * as GitHubIntegrations from "./GitHubIntegrations"
import * as GitHubWebhooks from "./GitHubWebhooks"

export const layer = Layer.mergeAll(
  GitHubIntegrations.layer,
  GitHubWebhooks.layer
).pipe(Layer.provideMerge(GitHub.layer))
