import * as FakeGitHub from "@pp/integration-github/FakeGitHub"
import * as GitHubClient from "@pp/integration-github/GitHub"
import * as GitHubServices from "@pp/integration-github/Services"
import * as GitHub from "@pp/server-core/github/GitHub"
import * as Config from "effect/Config"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import { GitHubHostLive } from "./HostLive"

const fakeServices = (statePath: string) =>
  GitHubServices.layerWith(FakeGitHub.layer(statePath))

type ServicesLayer = Layer.Layer<
  Layer.Success<typeof GitHubServices.layer>,
  never,
  | Layer.Services<typeof GitHubServices.layer>
  | Layer.Services<ReturnType<typeof fakeServices>>
>

const GitHubServicesLive = Layer.unwrap(
  Effect.gen(function* () {
    const fakeState = yield* Config.option(Config.String("GITHUB_FAKE_STATE"))
    const real: ServicesLayer = GitHubServices.layer
    if (Option.isNone(fakeState)) return real
    const environment = yield* Config.String("NODE_ENV").pipe(
      Config.withDefault("")
    )
    if (environment === "production")
      return yield* Effect.die("GITHUB_FAKE_STATE is not allowed in production")
    const fake: ServicesLayer = fakeServices(fakeState.value)
    return fake
  })
)

export const GitHubLive = Layer.effect(
  GitHub.GitHub,
  Effect.map(GitHubClient.GitHub, (client) => GitHub.GitHub.of(client))
).pipe(
  Layer.provideMerge(GitHubServicesLive),
  Layer.provideMerge(GitHubHostLive)
)
