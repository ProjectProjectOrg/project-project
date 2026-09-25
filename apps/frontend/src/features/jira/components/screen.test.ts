import type { JiraMigrationStatus } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { isActiveJiraMigration, jiraMigrationScreen } from "./screen"

describe("jiraMigrationScreen", () => {
  it.each<readonly [JiraMigrationStatus, string]>([
    ["scanning", "scan-progress"],
    ["needs_configuration", "configuration"],
    ["ready", "configuration"],
    ["migrating", "migration-progress"],
    ["cancelling", "migration-progress"],
    ["reconnect_required", "reconnect"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
    ["succeeded", "succeeded"]
  ])("routes %s to %s", (status, expected) => {
    expect(jiraMigrationScreen(status)).toBe(expected)
  })
})

describe("isActiveJiraMigration", () => {
  it("polls only work that can still make server-side progress", () => {
    expect(
      [
        "scanning",
        "needs_configuration",
        "ready",
        "migrating",
        "cancelling",
        "reconnect_required",
        "failed",
        "cancelled",
        "succeeded"
      ].filter((status) => isActiveJiraMigration(status as JiraMigrationStatus))
    ).toEqual(["scanning", "migrating", "cancelling"])
  })
})
