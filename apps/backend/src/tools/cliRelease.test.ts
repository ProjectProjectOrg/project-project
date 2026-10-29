import * as Option from "effect/Option"
import { describe, expect, it } from "vitest"

import { installWrapper, releaseForCommit } from "./cliRelease"

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
    expect(
      installWrapper(Option.some("v2026.10.29"), "https://pp.example.com")
    ).toContain(
      "curl -fsSL 'https://github.com/ProjectProjectOrg/project-project/releases/download/v2026.10.29/install.sh' | PP_VERSION='v2026.10.29' PP_SERVER='https://pp.example.com' sh"
    )
  })

  it("falls back to the latest stable release", () => {
    expect(installWrapper(Option.none(), "https://pp.example.com")).toContain(
      "releases/latest/download/install.sh' | PP_VERSION='latest'"
    )
  })
})
