import { it } from "@effect/vitest"
import { GitHubTokenExpired } from "@pp/shared"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import { beforeEach, describe, expect, vi } from "vitest"

import type { GitHubAppAuth } from "./appAuth"
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
const { GitHub } = await import("./GitHub")
const { GitHubLive } = await import("./GitHubLive")

const appAuthMock = vi.mocked(appAuth)

const fakeHost: Pick<GitHubHost["Service"], "userAccessToken"> = {
  userAccessToken: () => Effect.fail(new GitHubTokenExpired())
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

describe("tracing", () => {
  it.effect("traces each call under one GitHub span", () => {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    const offlineAuth = (() =>
      Promise.reject(new Error("offline"))) as unknown as GitHubAppAuth
    appAuthMock.mockReturnValueOnce(Effect.succeed(offlineAuth))
    return Effect.gen(function* () {
      const github = yield* GitHub
      yield* Effect.exit(github.getInstallationAccount("1"))
      yield* Effect.exit(github.listInstallationRepos("1", undefined, 1))
      yield* Effect.exit(
        github.createBranchAsUser("acme", "web", "T-1-x", "main", "user-1")
      )
      expect(
        spans.map((span) => ({
          name: span.name,
          parent: Option.map(span.parent, (parent) =>
            parent._tag === "Span" ? parent.name : parent._tag
          ).pipe(Option.getOrNull)
        }))
      ).toEqual([
        { name: "GitHub.getInstallationAccount", parent: null },
        { name: "GitHub.listInstallationRepos", parent: null },
        {
          name: "GitHub.installationTokenFor",
          parent: "GitHub.listInstallationRepos"
        },
        { name: "GitHub.createBranchAsUser", parent: null }
      ])
    }).pipe(
      Effect.withTracer(tracer),
      Effect.provide(
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
      ),
      Effect.provideService(ConfigProvider.ConfigProvider)(
        ConfigProvider.fromUnknown(Object.fromEntries(validConfig))
      )
    )
  })
})
