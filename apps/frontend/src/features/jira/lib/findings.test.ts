import type { JiraMigrationFinding } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { groupJiraFindings } from "./findings"

const finding = (kind: string, subject: string): JiraMigrationFinding => ({
  kind,
  subject,
  sourceId: null,
  ticketId: null,
  jiraUrl: null,
  consequence: `${kind} happened`
})

describe("groupJiraFindings", () => {
  it("groups by kind, needs-attention first and unknown kinds last", () => {
    const groups = groupJiraFindings([
      finding("tag-renamed", "web"),
      finding("brand-new-kind", "x"),
      finding("attachment-failed", "a.png"),
      finding("tag-renamed", "api")
    ])

    expect(groups.map((group) => group.kind)).toEqual([
      "attachment-failed",
      "tag-renamed",
      "brand-new-kind"
    ])
    expect(groups[1]?.findings).toHaveLength(2)
    expect(groups[2]?.title).toBeNull()
  })
})
