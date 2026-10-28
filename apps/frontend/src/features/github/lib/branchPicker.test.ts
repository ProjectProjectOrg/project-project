import type { BranchListItem } from "@pp/shared"
import { describe, expect, it } from "vitest"

import {
  branchPickerEntries,
  branchSearchView,
  defaultBranchName,
  mentionsTicket,
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

const names = (entries: ReturnType<typeof branchPickerEntries>) =>
  entries.map((entry) =>
    entry.kind === "create" ? `+${entry.name}` : entry.branch.name
  )

describe("mentionsTicket", () => {
  it("matches the ticket id as a whole token", () => {
    expect(mentionsTicket("bug/PROJ-7-login", "PROJ-7")).toBe(true)
    expect(mentionsTicket("proj-7", "PROJ-7")).toBe(true)
  })

  it("ignores longer ids that share a prefix", () => {
    expect(mentionsTicket("bug/PROJ-70-login", "PROJ-7")).toBe(false)
    expect(mentionsTicket("XPROJ-7", "PROJ-7")).toBe(false)
  })
})

describe("branchPickerEntries", () => {
  const items = [
    branch("feat/login"),
    branch("main"),
    branch("bug/PROJ-7-old"),
    branch("chore/cleanup")
  ]
  const base = {
    suggested: "bug/PROJ-7-new",
    canCreate: true,
    ticketId: "PROJ-7",
    defaultBase: "main"
  }
  it("puts this ticket's branches first, then create, default, and the rest", () => {
    expect(names(branchPickerEntries({ ...base, query: "", items }))).toEqual([
      "bug/PROJ-7-old",
      "+bug/PROJ-7-new",
      "main",
      "feat/login",
      "chore/cleanup"
    ])
  })

  it("offers the typed name last, sanitized", () => {
    expect(
      names(branchPickerEntries({ ...base, query: "feat new", items: [] }))
    ).toEqual(["+feat-new"])
  })

  it("skips create when the sanitized name already exists", () => {
    expect(
      names(branchPickerEntries({ ...base, query: " feat/login ", items }))
    ).not.toContain("+feat/login")
  })

  it("never offers create when creating is off", () => {
    expect(
      names(
        branchPickerEntries({ ...base, canCreate: false, query: "", items })
      ).some((name) => name.startsWith("+"))
    ).toBe(false)
  })
})

describe("branchSearchView", () => {
  const base = {
    items: [branch("main"), branch("feat/Login"), branch("fix/logout")],
    totalCount: 40,
    hasMore: true,
    loadingMore: false,
    loadMoreFailed: false
  }

  it("prefers the server's results for the current term", () => {
    const exact = { ...base, items: [branch("feat/login-v2")] }
    expect(branchSearchView({ term: "login", exact, base })).toBe(exact)
  })

  it("filters the loaded branches while the search is in flight", () => {
    expect(branchSearchView({ term: "LOG", exact: null, base })).toEqual({
      items: [branch("feat/Login"), branch("fix/logout")],
      totalCount: 2,
      hasMore: false,
      loadingMore: false,
      loadMoreFailed: false
    })
  })

  it("shows the loaded branches as they are without a term", () => {
    expect(branchSearchView({ term: "", exact: null, base })).toBe(base)
  })

  it("has nothing to show before any branches load", () => {
    expect(branchSearchView({ term: "x", exact: null, base: null })).toBeNull()
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
