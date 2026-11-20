import * as Layer from "effect/Layer"

import * as GitHub from "./GitHub"
import * as GitHubApps from "./GitHubApps"
import * as GitHubIntegrations from "./GitHubIntegrations"
import * as GitHubWebhooks from "./GitHubWebhooks"

export const layerWith = <E, R>(client: Layer.Layer<GitHub.GitHub, E, R>) =>
  Layer.mergeAll(GitHubIntegrations.layer, GitHubWebhooks.layer).pipe(
    Layer.provideMerge(client),
    Layer.provideMerge(GitHubApps.layer)
  )

export const layer = layerWith(GitHub.layer)
