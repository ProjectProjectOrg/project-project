import { GitHub as Client } from "@pp/integration-github/GitHub"
import { GitHubLive as ClientLive } from "@pp/integration-github/GitHubLive"
import { ProjectStateCache as ClientCache } from "@pp/integration-github/projectStateCache"
import { GitHub } from "@pp/server-core/github/GitHub"
import { ProjectStateCache } from "@pp/server-core/github/projectStateCache"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { GitHubHostLive } from "./HostLive"

export const GitHubLive = Layer.effect(
  GitHub,
  Effect.map(Client, (client) => GitHub.of(client))
).pipe(Layer.provideMerge(ClientLive), Layer.provide(GitHubHostLive))
export const GitHubCacheLive = Layer.effect(
  ProjectStateCache,
  Effect.map(ClientCache, (cache) =>
    ProjectStateCache.of({
      invalidateForInstallation: cache.invalidateForInstallation
    })
  )
)
