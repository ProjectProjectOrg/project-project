import * as Schema from "effect/Schema"

export const cliOAuthClient = {
  id: "projectproject-cli",
  name: "PP CLI",
  redirectUri: "http://127.0.0.1/callback",
  resourcePath: "/api/v1/tools",
  signedInPath: "/cli/signed-in",
  signInFailedPath: "/cli/sign-in-failed"
} as const

export const cliRelease = {
  repository: "ProjectProjectOrg/project-project",
  installScriptPath: "/api/cli/install.sh",
  releasePath: "/api/cli/release",
  toolVersionHeader: "pp-tool-version"
} as const

export const ServerCliRelease = Schema.Struct({
  version: Schema.NullOr(Schema.String)
})
export type ServerCliRelease = typeof ServerCliRelease.Type

const RELEASE_TAG = /^v\d{4}\.\d{2}\.\d{2}(?:\.\d+)?(?:-nightly\.\d+)?$/

export const isReleaseTag = (tag: string) => RELEASE_TAG.test(tag)
