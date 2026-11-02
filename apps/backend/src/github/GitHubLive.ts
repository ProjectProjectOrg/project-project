import * as GitHubClient from "@pp/integration-github/GitHub"
import * as GitHubServices from "@pp/integration-github/Services"
import { GitHub } from "@pp/server-core/github/GitHub"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { GitHubHostLive } from "./HostLive"

export const GitHubLive = Layer.effect(
  GitHub,
  Effect.map(GitHubClient.GitHub, (client) => GitHub.of(client))
).pipe(
  Layer.provideMerge(GitHubServices.layer),
  Layer.provideMerge(GitHubHostLive)
)
