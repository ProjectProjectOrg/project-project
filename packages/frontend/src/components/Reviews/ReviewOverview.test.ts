import { describe, expect, it } from "vitest"
import { checkSummaryLabel, diffPipTones } from "./ReviewOverview"

describe("checkSummaryLabel", () => {
  it.each([
    {
      checks: { status: "passing", completedCount: 1, totalCount: 1 },
      expected: "1 of 1 checks passed"
    },
    {
      checks: { status: "passing", completedCount: 3, totalCount: 3 },
      expected: "3 of 3 checks passed"
    },
    {
      checks: { status: "pending", completedCount: 1, totalCount: 2 },
      expected: "1 of 2 checks completed · pending"
    },
    {
      checks: { status: "failing", completedCount: 2, totalCount: 2 },
      expected: "2 of 2 checks completed · failing"
    },
    {
      checks: { status: "neutral", completedCount: 1, totalCount: 1 },
      expected: "1 of 1 checks completed · neutral"
    },
    {
      checks: { status: "none", completedCount: 0, totalCount: 0 },
      expected: "No checks"
    }
  ] as const)("returns $expected", ({ checks, expected }) => {
    expect(checkSummaryLabel(checks)).toBe(expected)
  })
})

describe("diffPipTones", () => {
  it.each([
    {
      name: "additions only",
      additions: 6,
      deletions: 0,
      expected: [
        "addition",
        "addition",
        "addition",
        "addition",
        "addition",
        "addition"
      ]
    },
    {
      name: "deletions only",
      additions: 0,
      deletions: 6,
      expected: [
        "deletion",
        "deletion",
        "deletion",
        "deletion",
        "deletion",
        "deletion"
      ]
    },
    {
      name: "balanced changes",
      additions: 3,
      deletions: 3,
      expected: [
        "addition",
        "addition",
        "addition",
        "deletion",
        "deletion",
        "deletion"
      ]
    },
    {
      name: "small deletion count",
      additions: 11,
      deletions: 1,
      expected: [
        "addition",
        "addition",
        "addition",
        "addition",
        "addition",
        "deletion"
      ]
    },
    {
      name: "small addition count",
      additions: 1,
      deletions: 11,
      expected: [
        "addition",
        "deletion",
        "deletion",
        "deletion",
        "deletion",
        "deletion"
      ]
    },
    {
      name: "tiny mixed change",
      additions: 1,
      deletions: 1,
      expected: [
        "addition",
        "addition",
        "addition",
        "deletion",
        "deletion",
        "deletion"
      ]
    },
    {
      name: "no changes",
      additions: 0,
      deletions: 0,
      expected: ["muted", "muted", "muted", "muted", "muted", "muted"]
    }
  ])("$name", ({ additions, deletions, expected }) => {
    expect(diffPipTones({ additions, deletions })).toEqual(expected)
  })
})
