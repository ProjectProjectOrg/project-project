import { it } from "@effect/vitest"
import { GitHubTokenExpired } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Tracer from "effect/Tracer"
import { describe, expect } from "vitest"

import type { GitHubAppAuth } from "./appAuth"
import * as GitHubApps from "./GitHubApps"
import { GitHubHost } from "./Host"
import * as ProjectStateCache from "./projectStateCache"
import * as GitHubRequest from "./request"

const GitHub = await import("./GitHub")

const fakeHost: Pick<GitHubHost["Service"], "userAccessToken"> = {
  userAccessToken: () => Effect.fail(new GitHubTokenExpired())
}

const FakeBetterAuthLive = Layer.mock(GitHubHost, fakeHost)

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
    return Effect.gen(function* () {
      const github = yield* GitHub.GitHub
      yield* Effect.exit(github.getInstallationAccount("app", "1"))
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
        GitHub.layer.pipe(
          Layer.provide(
            Layer.mergeAll(
              FakeBetterAuthLive,
              Layer.mock(GitHubApps.GitHubApps, {
                auth: () => Effect.succeed(offlineAuth),
                authForInstallation: () => Effect.succeed(offlineAuth)
              }),
              ProjectStateCache.layer,
              GitHubRequest.layer,
              Layer.succeed(FetchHttpClient.Fetch, globalThis.fetch)
            )
          )
        )
      )
    )
  })
})

describe("githubRepoMatchesQuery", () => {
  const repo = {
    owner: { login: "outside-org" },
    name: "project-project",
    description: "Markdown-first planning"
  }

  it("matches repositories by organization owner", () => {
    expect(GitHub.githubRepoMatchesQuery(repo, "outside-org")).toBe(true)
  })

  it("matches repository search across owner and name tokens", () => {
    expect(GitHub.githubRepoMatchesQuery(repo, "outside project")).toBe(true)
  })

  it("does not match unrelated repositories", () => {
    expect(GitHub.githubRepoMatchesQuery(repo, "personal-only")).toBe(false)
  })
})
