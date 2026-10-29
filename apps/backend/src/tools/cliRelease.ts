import { cliRelease } from "@pp/shared"
import { HttpClientResponse } from "effect/http"
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

const quote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`

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
  const version = Option.getOrElse(release, () => "latest")
  return [
    "#!/bin/sh",
    "set -eu",
    `curl -fsSL ${quote(`${base}/install.sh`)} | PP_VERSION=${quote(version)} PP_SERVER=${quote(origin)} sh`,
    ""
  ].join("\n")
}
