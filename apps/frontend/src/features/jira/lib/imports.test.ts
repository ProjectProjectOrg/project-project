import type { JiraMigrationSummary } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import {
  groupJiraImports,
  jiraProgressRatio,
  unfinishedImportOf
} from "./imports"

const summary = (
  id: string,
  status: JiraMigrationSummary["status"],
  updatedAt: string
): JiraMigrationSummary => ({
  id,
  sourceCloudId: "cloud",
  sourceProjectId: `project-${id}`,
  sourceProjectKey: "APP",
  sourceProjectName: "App",
  status,
  phase: "scan",
  revision: 1,
  progress: { phase: "scan", done: 5, total: 10 },
  destinationProjectSlug: null,
  createdAt: DateTime.makeUnsafe(updatedAt),
  updatedAt: DateTime.makeUnsafe(updatedAt)
})

describe("groupJiraImports", () => {
  it("puts running work first, then set up, then finished, newest first", () => {
    const groups = groupJiraImports([
      summary("done", "succeeded", "2026-11-01T00:00:00Z"),
      summary("old-setup", "needs_configuration", "2026-11-02T00:00:00Z"),
      summary("failed", "failed", "2026-11-03T00:00:00Z"),
      summary("new-setup", "ready", "2026-11-04T00:00:00Z"),
      summary("scan", "scanning", "2026-11-05T00:00:00Z")
    ])

    expect(groups.running.map((item) => item.id)).toEqual(["scan", "failed"])
    expect(groups.setup.map((item) => item.id)).toEqual([
      "new-setup",
      "old-setup"
    ])
    expect(groups.finished.map((item) => item.id)).toEqual(["done"])
  })

  it("finds an unfinished import of the same project", () => {
    const imports = [summary("a", "succeeded", "2026-11-01T00:00:00Z")]

    expect(unfinishedImportOf(imports, "cloud", "project-a")).toBeUndefined()
    expect(
      unfinishedImportOf(
        [summary("a", "ready", "2026-11-01T00:00:00Z")],
        "cloud",
        "project-a"
      )?.id
    ).toBe("a")
  })

  it("only reports a ratio when the total is known", () => {
    expect(jiraProgressRatio({ phase: "scan", done: 5, total: 10 })).toBe(0.5)
    expect(
      jiraProgressRatio({ phase: "scan", done: 5, total: null })
    ).toBeNull()
  })
})
