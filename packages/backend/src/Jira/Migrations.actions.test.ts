import { describe, expect, it } from "vite-plus/test"
import * as DateTime from "effect/DateTime"
import { actionsFor } from "./Migrations"
import type { jiraMigration } from "../db/schema"

type Row = typeof jiraMigration.$inferSelect

const scannedAt = DateTime.toDate(DateTime.makeUnsafe("2026-09-16T10:00:00Z"))

const row = (overrides: Partial<Row>): Row =>
  ({
    id: "migration-1",
    requestId: "request-1",
    organizationId: "org-1",
    initiatedBy: "user-1",
    sourceCloudId: "cloud-1",
    sourceSiteName: "Example",
    sourceSiteUrl: "https://example.atlassian.net",
    sourceProjectId: "10000",
    sourceProjectKey: "APP",
    sourceProjectName: "Application",
    status: "failed",
    phase: "migrate",
    revision: 5,
    manifestVersion: 1,
    stagingPrefix: "migrations/jira/migration-1",
    configuration: null,
    checkpoint: null,
    progressDone: 0,
    progressTotal: null,
    workflowExecutionId: "execution-1",
    workflowAttempt: 1,
    scanRevision: 1,
    failureSequence: 0,
    retainedUntil: null,
    cleanupExecutionId: null,
    leaseId: null,
    leaseExpiresAt: null,
    scanAt: scannedAt,
    destinationProjectId: null,
    destinationProjectSlug: null,
    reportPath: null,
    failureReason: "preflight_blocked",
    failureRetryable: false,
    createdAt: scannedAt,
    updatedAt: scannedAt,
    finishedAt: null,
    ...overrides
  }) as Row

describe("actionsFor a failed migration", () => {
  it("blocks actions while cleanup owns the migration", () => {
    expect(
      Object.values(actionsFor(row({ cleanupExecutionId: "cleanup-1" })))
    ).toEqual(Array(6).fill(false))
  })
  it("lets the user return to mapping when the scan survived", () => {
    const actions = actionsFor(row({}))

    expect(actions.canConfigure).toBe(true)
    expect(actions.canRetry).toBe(false)
  })

  it("offers a plain retry instead when the failure was transient", () => {
    const actions = actionsFor(
      row({ failureReason: "storage_unavailable", failureRetryable: true })
    )

    expect(actions.canRetry).toBe(true)
  })

  it("does not offer mapping when the scan never completed", () => {
    const actions = actionsFor(row({ scanAt: null }))

    expect(actions.canConfigure).toBe(false)
  })

  it("still allows mapping while a migration is merely unconfigured", () => {
    expect(
      actionsFor(row({ status: "needs_configuration", failureReason: null }))
        .canConfigure
    ).toBe(true)
  })
})
