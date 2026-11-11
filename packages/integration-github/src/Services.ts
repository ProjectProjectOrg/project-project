import * as Layer from "effect/Layer"

import * as GitHub from "./GitHub"
import * as GitHubApps from "./GitHubApps"
import * as GitHubIntegrations from "./GitHubIntegrations"
import * as GitHubWebhooks from "./GitHubWebhooks"

export const layer = Layer.mergeAll(
  GitHubIntegrations.layer,
  GitHubWebhooks.layer
).pipe(Layer.provideMerge(GitHub.layer), Layer.provideMerge(GitHubApps.layer))
