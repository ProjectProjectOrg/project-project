import { cliRelease, runInstaller } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

const Release = Schema.Struct({
  tag_name: Schema.String,
  target_commitish: Schema.String,
  draft: Schema.Boolean,
  prerelease: Schema.Boolean,
  assets: Schema.Array(Schema.Struct({ name: Schema.String }))
})
type Release = typeof Release.Type

export const decodeReleases = HttpClientResponse.schemaBodyJson(
  Schema.Array(Release)
)

export const releaseForCommit = (
  releases: ReadonlyArray<Release>,
  commit: string
): Option.Option<string> => {
  const matching = releases.filter(
    (release) =>
      !release.draft &&
      release.target_commitish === commit &&
      release.assets.some((asset) => asset.name === "install.sh")
  )
  const preferred =
    matching.find((release) => !release.prerelease) ?? matching[0]
  return Option.map(
    Option.fromNullishOr(preferred),
    (release) => release.tag_name
  )
}

const RELEASES_PER_PAGE = 100
const MAX_RELEASE_PAGES = 10

const github = (path: string) =>
  Effect.flatMap(HttpClient.HttpClient, (client) =>
    HttpClientRequest.get(
      `https://api.github.com/repos/${cliRelease.repository}${path}`
    ).pipe(
      HttpClientRequest.setHeaders({
        accept: "application/vnd.github+json",
        "user-agent": "projectproject-server"
      }),
      client.execute
    )
  )

const decodeRelease = HttpClientResponse.schemaBodyJson(Release)

const releasesPage = (page: number) =>
  github(`/releases?per_page=${RELEASES_PER_PAGE}&page=${page}`).pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.flatMap(decodeReleases)
  )

const searchReleases = (
  commit: string,
  page: number
): Effect.Effect<
  Option.Option<string>,
  Effect.Error<ReturnType<typeof releasesPage>>,
  HttpClient.HttpClient
> =>
  Effect.gen(function* () {
    const releases = yield* releasesPage(page)
    const found = releaseForCommit(releases, commit)
    if (
      Option.isSome(found) ||
      releases.length < RELEASES_PER_PAGE ||
      page >= MAX_RELEASE_PAGES
    ) {
      return found
    }
    return yield* searchReleases(commit, page + 1)
  })

export const findRelease = (commit: string) => searchReleases(commit, 1)

const hasInstaller = (release: Release) =>
  !release.draft && release.assets.some((asset) => asset.name === "install.sh")

export const findTaggedRelease = (tag: string) =>
  Effect.gen(function* () {
    const response = yield* github(`/releases/tags/${encodeURIComponent(tag)}`)
    if (response.status === 404) return Option.none<string>()
    const release = yield* HttpClientResponse.filterStatusOk(response).pipe(
      Effect.flatMap(decodeRelease)
    )
    return hasInstaller(release) ? Option.some(release.tag_name) : Option.none()
  })

export const installWrapper = (
  release: Option.Option<string>,
  origin: string
) => {
  const base = Option.match(release, {
    onNone: () =>
      `https://github.com/${cliRelease.repository}/releases/latest/download`,
    onSome: (tag) =>
      `https://github.com/${cliRelease.repository}/releases/download/${tag}`
  })
  return [
    "#!/bin/sh",
    "set -eu",
    runInstaller(`${base}/install.sh`, {
      PP_VERSION: Option.getOrElse(release, () => "latest"),
      PP_SERVER: origin
    }),
    ""
  ].join("\n")
}
