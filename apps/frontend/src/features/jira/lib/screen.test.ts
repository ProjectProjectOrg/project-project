import { describe, expect, it } from "vitest"

import { jiraProgressCount, jiraStoppedKind, navigableStages } from "./screen"

const actions = {
  canConfigure: true,
  canRun: false,
  canRescan: true,
  canCancel: false,
  canRetry: false,
  canDiscard: true
}

describe("navigableStages", () => {
  it("lets set up move between its steps and a stopped import return to them", () => {
    expect(navigableStages({ status: "ready", actions }, true)).toEqual([
      "scan",
      "setup",
      "review"
    ])
    expect(navigableStages({ status: "failed", actions }, true)).toEqual([
      "setup",
      "review",
      "import"
    ])
  })

  it("offers nothing without a scan, while running or when the server says no", () => {
    expect(navigableStages({ status: "ready", actions }, false)).toEqual([])
    expect(navigableStages({ status: "migrating", actions }, true)).toEqual([])
    expect(
      navigableStages(
        { status: "failed", actions: { ...actions, canConfigure: false } },
        true
      )
    ).toEqual([])
  })
})

describe("jiraProgressCount", () => {
  it("shows done of total, a running count, or nothing yet", () => {
    expect(jiraProgressCount({ phase: "x", done: 3, total: 10 })).toBe(
      "3 of 10"
    )
    expect(jiraProgressCount({ phase: "x", done: 4, total: null })).toBe(
      "4 records read"
    )
    expect(jiraProgressCount({ phase: "x", done: 0, total: null })).toBeNull()
  })
})

describe("jiraStoppedKind", () => {
  it("treats every other stopped screen as a failure", () => {
    expect(jiraStoppedKind("cancelled")).toBe("cancelled")
    expect(jiraStoppedKind("unavailable")).toBe("unavailable")
    expect(jiraStoppedKind("reconnect")).toBe("failed")
  })
})
