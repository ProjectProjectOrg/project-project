import type { GitState } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { canStackOn } from "./stacking"

const name = "feat/T-1-base"
const pr = {
  branch: name,
  baseBranch: "main",
  number: 12,
  url: "https://github.com/acme/widgets/pull/12",
  title: "Base"
}

describe("canStackOn", () => {
  it("offers stacking once a pull request is merged or closed, but not while the branch is pending", () => {
    const done: ReadonlyArray<GitState> = [
      { tag: "pr_merged", ...pr, mergedAt: null },
      { tag: "pr_closed", ...pr }
    ]
    expect(done.every(canStackOn)).toBe(true)
    expect(
      canStackOn({ tag: "branch_pending", name, baseBranch: "main" })
    ).toBe(false)
  })
})
