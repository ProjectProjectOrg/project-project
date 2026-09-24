import { describe, expect, it } from "vitest"

import { copyKey, keyFromName, keyProblem, rowActions } from "./libraryModel"

const entry = (
  origin: "org" | "project",
  shadows: "org" | "project" | null,
  hidden = false
) => ({ key: "chore", origin, shadows, hidden })

describe("rowActions", () => {
  it("offers customize, duplicate and hide on org entries in a project", () => {
    expect(rowActions(entry("org", null), "project", true)).toEqual([
      "customize",
      "duplicate",
      "hide"
    ])
  })

  it("resets overrides and deletes own entries", () => {
    expect(rowActions(entry("project", "org"), "project", true)).toEqual([
      "duplicate",
      "reset"
    ])
    expect(rowActions(entry("org", null), "org", true)).toEqual([
      "duplicate",
      "delete"
    ])
  })

  it("offers nothing to read-only viewers or on hidden entries", () => {
    expect(rowActions(entry("org", null), "project", false)).toEqual([])
    expect(rowActions(entry("project", "org", true), "project", true)).toEqual(
      []
    )
  })
})

describe("keys", () => {
  it("slugifies names and caps the length", () => {
    expect(keyFromName("Security review!")).toBe("security-review")
    expect(keyFromName("a".repeat(60)).length).toBe(48)
  })

  it("reports invalid, reserved and taken keys", () => {
    const taken = new Set(["chore"])
    expect(keyProblem("Bad key", "template", taken)).toBe("invalid")
    expect(keyProblem("blank", "template", taken)).toBe("reserved")
    expect(keyProblem("blank", "block", taken)).toBeNull()
    expect(keyProblem("chore", "block", taken)).toBe("taken")
  })

  it("finds a free copy key", () => {
    expect(copyKey("chore", new Set(["chore"]))).toBe("chore-copy")
    expect(copyKey("chore", new Set(["chore-copy"]))).toBe("chore-copy-2")
    expect(copyKey("a".repeat(48), new Set()).length).toBe(48)
  })
})
