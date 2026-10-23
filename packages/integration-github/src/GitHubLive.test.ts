import { it } from "@effect/vitest"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import { beforeEach, describe, expect, vi } from "vitest"

import { GitHubHost } from "./Host"
import * as ProjectStateCache from "./projectStateCache"
import * as GitHubRequest from "./request"

vi.mock("./appAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./appAuth")>()
  return {
    ...actual,
    appAuth: vi.fn(actual.appAuth)
  }
})

const { appAuth } = await import("./appAuth")
const { GitHubLive } = await import("./GitHubLive")

const appAuthMock = vi.mocked(appAuth)

const fakeHost: Pick<GitHubHost["Service"], "userAccessToken"> = {
  userAccessToken: () => Effect.die("not implemented")
}

const FakeBetterAuthLive = Layer.mock(GitHubHost, fakeHost)

const buildGitHubLayer = (config: Map<string, string>) =>
  Layer.build(
    GitHubLive.pipe(
      Layer.provide(
        Layer.mergeAll(
          FakeBetterAuthLive,
          ProjectStateCache.layer,
          GitHubRequest.layer,
          Layer.succeed(FetchHttpClient.Fetch, globalThis.fetch)
        )
      )
    )
  ).pipe(
    Effect.scoped,
    Effect.provideService(ConfigProvider.ConfigProvider)(
      ConfigProvider.fromUnknown(Object.fromEntries(config))
    )
  )

const validConfig = new Map([
  ["GITHUB_APP_ID", "123"],
  [
    "GITHUB_APP_PRIVATE_KEY",
    "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----"
  ],
  ["GITHUB_APP_CLIENT_ID", "client-id"],
  ["GITHUB_APP_CLIENT_SECRET", "client-secret"]
])

describe("GitHubLive", () => {
  beforeEach(() => {
    appAuthMock.mockClear()
  })

  it.effect(
    "fails to construct the layer when GitHub App config is missing",
    () =>
      Effect.gen(function* () {
        const error = yield* buildGitHubLayer(new Map()).pipe(Effect.flip)

        expect(error._tag).toBe("GitHubError")
        expect(appAuthMock).toHaveBeenCalledTimes(1)
      })
  )

  it.effect("acquires appAuth exactly once during layer construction", () =>
    Effect.gen(function* () {
      yield* buildGitHubLayer(validConfig)

      expect(appAuthMock).toHaveBeenCalledTimes(1)
    })
  )
})
