import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vite-plus/test"
import * as DateTime from "effect/DateTime"
import type { JiraMigrationScanSummary } from "@projectproject/shared"
import { JiraSnapshotStep } from "./JiraSnapshotStep"

afterEach(cleanup)

const summary: JiraMigrationScanSummary = {
  siteName: "Example Jira",
  siteUrl: "https://example.atlassian.net",
  projectName: "Platform",
  projectKey: "WEB",
  scannedAt: DateTime.makeUnsafe("2026-09-15T10:00:00.000Z"),
  counts: {
    identities: 12,
    statuses: 6,
    issueTypes: 4,
    priorities: 3,
    tags: 9,
    issues: 248,
    comments: 613,
    attachments: 42,
    groups: 8,
    restrictions: 0
  },
  visibilityWarnings: []
}

describe("JiraSnapshotStep", () => {
  it("groups real snapshot counts into the three summary rows", () => {
    render(<JiraSnapshotStep summary={summary} />)

    expect(screen.getByText("Your snapshot is ready")).not.toBeNull()
    expect(screen.getByText("People and project data")).not.toBeNull()
    expect(screen.getByText("Planning")).not.toBeNull()
    expect(screen.getByText("Attachments")).not.toBeNull()
    expect(screen.getByText(/12 people · 6 statuses/)).not.toBeNull()
    expect(screen.getByText(/248 issues · 613 comments/)).not.toBeNull()
    expect(screen.getByText("42 attachments")).not.toBeNull()
  })
})
