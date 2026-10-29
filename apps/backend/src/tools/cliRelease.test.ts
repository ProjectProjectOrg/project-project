import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { HttpClient, HttpClientResponse } from "effect/http"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"

import {
  findRelease,
  findTaggedRelease,
  installWrapper,
  releaseForCommit
} from "./cliRelease"

const release = (
  tag: string,
  commit: string,
  options: Readonly<{ prerelease?: boolean; installer?: boolean }> = {}
) => ({
  tag_name: tag,
  target_commitish: commit,
  draft: false,
  prerelease: options.prerelease ?? false,
  assets: options.installer === false ? [] : [{ name: "install.sh" }]
})

describe("releaseForCommit", () => {
  it("prefers the stable release of a commit over its nightly", () => {
    expect(
      releaseForCommit(
        [
          release("v2026.10.29-nightly.12", "abc", { prerelease: true }),
          release("v2026.10.29", "abc"),
          release("v2026.10.28", "def")
        ],
        "abc"
      )
    ).toEqual(Option.some("v2026.10.29"))
  })

  it("uses the nightly when the commit never went stable", () => {
    expect(
      releaseForCommit(
        [release("v2026.10.29-nightly.12", "abc", { prerelease: true })],
        "abc"
      )
    ).toEqual(Option.some("v2026.10.29-nightly.12"))
  })

  it("ignores releases without a pp installer and other commits", () => {
    expect(
      releaseForCommit(
        [
          release("v2026.10.29", "abc", { installer: false }),
          release("v1", "def")
        ],
        "abc"
      )
    ).toEqual(Option.none())
  })
})

describe("installWrapper", () => {
  it("pins the installer to the server's release and signs in to it", () => {
    const script = installWrapper(
      Option.some("v2026.10.29"),
      "https://pp.example.com"
    )
    expect(script).toContain(
      "curl -fsSL 'https://github.com/ProjectProjectOrg/project-project/releases/download/v2026.10.29/install.sh'"
    )
    expect(script).toContain(
      "PP_VERSION='v2026.10.29' PP_SERVER='https://pp.example.com' sh"
    )
  })

  it("falls back to the latest stable release", () => {
    const script = installWrapper(Option.none(), "https://pp.example.com")
    expect(script).toContain("releases/latest/download/install.sh'")
    expect(script).toContain("PP_VERSION='latest'")
  })
})

const githubWith = (
  pages: ReadonlyArray<ReadonlyArray<ReturnType<typeof release>>>
) => {
  const requested: Array<string> = []
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) => {
      const page = Number(url.searchParams.get("page"))
      requested.push(String(page))
      return Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          Response.json(pages[page - 1] ?? [])
        )
      )
    })
  )
  return { layer, requested }
}

const others = (count: number, offset: number) =>
  Array.from({ length: count }, (_, index) =>
    release(`v${offset + index}`, `other-${offset + index}`)
  )

describe("findRelease", () => {
  it.effect("keeps reading pages until it finds the server's commit", () => {
    const github = githubWith([others(100, 0), [release("v2026.10.29", "abc")]])
    return Effect.gen(function* () {
      expect(yield* findRelease("abc")).toEqual(Option.some("v2026.10.29"))
      expect(github.requested).toEqual(["1", "2"])
    }).pipe(Effect.provide(github.layer))
  })

  it.effect("stops at the last page, and after ten pages at most", () => {
    const short = githubWith([others(100, 0), others(3, 100)])
    const endless = githubWith(
      Array.from({ length: 12 }, (_, page) => others(100, page * 100))
    )
    return Effect.gen(function* () {
      expect(
        yield* findRelease("abc").pipe(Effect.provide(short.layer))
      ).toEqual(Option.none())
      expect(short.requested).toEqual(["1", "2"])
      expect(
        yield* findRelease("abc").pipe(Effect.provide(endless.layer))
      ).toEqual(Option.none())
      expect(endless.requested).toHaveLength(10)
    })
  })
})

const githubTag = (status: number, body: unknown) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.succeed(
        HttpClientResponse.fromWeb(
          request,
          url.pathname.endsWith("/releases/tags/v2026.10.29")
            ? Response.json(body, { status })
            : new Response("not found", { status: 404 })
        )
      )
    )
  )

describe("findTaggedRelease", () => {
  it.effect(
    "uses a release-tagged server build when it has the pp installer",
    () =>
      Effect.gen(function* () {
        expect(yield* findTaggedRelease("v2026.10.29")).toEqual(
          Option.some("v2026.10.29")
        )
      }).pipe(Effect.provide(githubTag(200, release("v2026.10.29", "abc"))))
  )

  it.effect(
    "falls back when the release has no pp installer or doesn't exist",
    () =>
      Effect.gen(function* () {
        expect(
          yield* findTaggedRelease("v2026.10.29").pipe(
            Effect.provide(
              githubTag(
                200,
                release("v2026.10.29", "abc", { installer: false })
              )
            )
          )
        ).toEqual(Option.none())
        expect(
          yield* findTaggedRelease("v2026.10.29").pipe(
            Effect.provide(githubTag(404, { message: "Not Found" }))
          )
        ).toEqual(Option.none())
      })
  )
})
