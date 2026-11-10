import { describe, expect, it } from "vitest"

import { jiraScanCountLine } from "./scanCounts"

describe("jiraScanCountLine", () => {
  it("leads with issues, comments and attachments and drops unknown kinds", () => {
    const line = jiraScanCountLine({
      sprints: 4,
      comments: 5310,
      issues: 1240,
      mystery: 3
    })

    expect(line.primary.map((entry) => entry.kind)).toEqual([
      "issues",
      "comments"
    ])
    expect(line.secondary.map((entry) => entry.kind)).toEqual(["sprints"])
  })

  it("is empty when the scan reports nothing yet", () => {
    expect(jiraScanCountLine(undefined)).toEqual({
      primary: [],
      secondary: []
    })
  })
})
