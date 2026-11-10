import { describe, expect, it } from "vitest"

import { jiraVisibility } from "./warnings"

const warning = (category: string, detail: string | null) => ({
  category,
  label: category,
  detail
})

describe("jiraVisibility", () => {
  it("says nothing is missing when there are no warnings", () => {
    expect(jiraVisibility([])).toEqual({ kind: "complete" })
  })

  it("collapses generic permission warnings into one statement", () => {
    expect(
      jiraVisibility([
        warning("comments", "jira-permissions"),
        warning("mystery", null),
        warning("mystery-two", "jira-permissions")
      ])
    ).toEqual({ kind: "account" })
  })

  it("groups by category and reason and lists other data once", () => {
    const visibility = jiraVisibility([
      warning("comments", "unsupported_or_missing"),
      warning("comments", "unsupported_or_missing"),
      warning("mystery", "jira-permissions"),
      warning("mystery-two", "unsupported_or_missing"),
      warning("worklogs", "jira-permissions")
    ])

    expect(visibility.kind).toBe("limited")
    if (visibility.kind !== "limited") return
    expect(visibility.rows.map((row) => row.label)).toEqual([
      "Comments",
      "Work logs",
      "Other data"
    ])
  })
})
