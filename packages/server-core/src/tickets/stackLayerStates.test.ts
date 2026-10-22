import { describe, expect, it } from "vitest"

import type { RawBranchEntry } from "../github/GitHub"
import { stackLayerStates } from "./stackLayerStates"

const repository = { repoOwner: "acme", repoName: "app" }

const livePr = (overrides: Partial<RawBranchEntry>): RawBranchEntry => ({
  headRefName: "ui",
  baseRefName: "api",
  state: "open",
  draft: false,
  number: 42,
  url: "https://github.test/pull/42",
  title: "Checkout UI",
  mergedAt: null,
  checks: "failing",
  ...overrides
})

describe("stackLayerStates", () => {
  const stack = [
    { branch: "polish", base: "ui" },
    { branch: "ui", base: "api", pr: 42, prState: "open" as const },
    {
      branch: "api",
      base: "feat/T-1",
      pr: 41,
      prState: "merged" as const,
      landed: true
    }
  ]

  it("orders layers bottom to top and links pull requests without a snapshot", () => {
    expect(stackLayerStates("feat/T-1", stack, repository)).toEqual([
      {
        branch: "api",
        base: "feat/T-1",
        depth: 1,
        pr: {
          number: 41,
          url: "https://github.com/acme/app/pull/41",
          title: "",
          state: "merged",
          draft: false,
          landed: true,
          checks: null
        },
        deleted: false
      },
      expect.objectContaining({ branch: "ui", depth: 2 }),
      { branch: "polish", base: "ui", depth: 3, pr: null, deleted: false }
    ])
  })

  it("takes titles and checks from a snapshot and marks vanished branches", () => {
    const layers = stackLayerStates("feat/T-1", stack, repository, {
      existingBranches: new Set(["ui"]),
      prByBranch: new Map([
        ["ui", livePr({})],
        ["api", livePr({ headRefName: "api", number: 41, state: "merged" })]
      ])
    })

    expect(layers.map((layer) => [layer.branch, layer.deleted])).toEqual([
      ["api", false],
      ["ui", false],
      ["polish", true]
    ])
    expect(layers[1]?.pr).toMatchObject({
      url: "https://github.test/pull/42",
      title: "Checkout UI",
      checks: "failing"
    })
    expect(layers[0]?.pr?.checks).toBeNull()
  })
})
