import { describe, expect, it } from "vitest"
import { diffPipTones } from "./ReviewOverview"

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
