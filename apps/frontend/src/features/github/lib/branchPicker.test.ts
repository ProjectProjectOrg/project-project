import type { BranchListItem } from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  branchPickerEntries,
  defaultBranchName,
  retainLatest,
  sanitizeBranchName,
  shouldLoadMoreBranches
} from "./branchPicker"

const branch = (name: string): BranchListItem => ({ name, isProtected: false })

describe("defaultBranchName", () => {
  it("fills the default template", () => {
    expect(defaultBranchName(null, "feat", "T-1", "Add Login Page")).toBe(
      "feat/T-1-add-login-page"
    )
  })

  it("fills a project template", () => {
    expect(defaultBranchName("{id}/{slug}", "fix", "T-2", "Crash!")).toBe(
      "T-2/crash"
    )
  })
})

describe("sanitizeBranchName", () => {
  it("trims and dashes whitespace", () => {
    expect(sanitizeBranchName("  my new  branch ")).toBe("my-new-branch")
  })
})

describe("branchPickerEntries", () => {
  const items = [branch("main"), branch("feat/login")]

  it("leads with the suggested branch when nothing is typed", () => {
    expect(
      branchPickerEntries({
        query: "",
        suggested: "feat/T-1-x",
        items,
        canCreate: true
      })
    ).toEqual([
      { kind: "create", name: "feat/T-1-x" },
      { kind: "branch", branch: branch("main") },
      { kind: "branch", branch: branch("feat/login") }
    ])
  })

  it("offers the typed name last, sanitized", () => {
    expect(
      branchPickerEntries({
        query: "feat new",
        suggested: "feat/T-1-x",
        items: [],
        canCreate: true
      })
    ).toEqual([{ kind: "create", name: "feat-new" }])
  })

  it("skips create when the sanitized name already exists", () => {
    expect(
      branchPickerEntries({
        query: " feat/login ",
        suggested: "feat/T-1-x",
        items,
        canCreate: true
      }).map((entry) => entry.kind)
    ).toEqual(["branch", "branch"])
  })

  it("never offers create when creating is off", () => {
    expect(
      branchPickerEntries({
        query: "",
        suggested: "feat/T-1-x",
        items,
        canCreate: false
      }).map((entry) => entry.kind)
    ).toEqual(["branch", "branch"])
  })
})

describe("retainLatest", () => {
  it("keeps the previous value while the same key reloads", () => {
    const cache = retainLatest({ key: "repo-a", value: null }, "repo-a", [1])
    expect(retainLatest(cache, "repo-a", null)).toEqual({
      key: "repo-a",
      value: [1]
    })
  })

  it("drops the previous value when the key changes", () => {
    const cache = retainLatest({ key: "repo-a", value: null }, "repo-a", [1])
    expect(retainLatest(cache, "repo-b", null)).toEqual({
      key: "repo-b",
      value: null
    })
  })
})

describe("shouldLoadMoreBranches", () => {
  it("loads when the list is scrolled near its end", () => {
    expect(
      shouldLoadMoreBranches({
        scrollTop: 300,
        scrollHeight: 600,
        clientHeight: 220
      })
    ).toBe(true)
  })

  it("waits while the end is still far away", () => {
    expect(
      shouldLoadMoreBranches({
        scrollTop: 0,
        scrollHeight: 600,
        clientHeight: 220
      })
    ).toBe(false)
  })
})
