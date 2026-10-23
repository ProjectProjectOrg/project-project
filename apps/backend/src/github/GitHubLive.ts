import { GitHub as Client } from "@pp/integration-github/GitHub"
import { GitHubServicesLive } from "@pp/integration-github/Services"
import { GitHub } from "@pp/server-core/github/GitHub"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { GitHubHostLive } from "./HostLive"

export const GitHubLive = Layer.effect(
  GitHub,
  Effect.map(Client, (client) => GitHub.of(client))
).pipe(
  Layer.provideMerge(GitHubServicesLive),
  Layer.provideMerge(GitHubHostLive)
)
