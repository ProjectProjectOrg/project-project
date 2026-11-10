import type { JiraMigrationDetail } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { jiraFailurePlan, jiraStoppedActions } from "./failure"

const detail = (
  overrides: Partial<
    Pick<
      JiraMigrationDetail,
      "status" | "failure" | "failedAttachmentIds" | "scanSummary"
    >
  > &
    Readonly<{ actions?: Partial<JiraMigrationDetail["actions"]> }>
) => ({
  status: overrides.status ?? ("failed" as const),
  failure: overrides.failure ?? null,
  failedAttachmentIds: overrides.failedAttachmentIds ?? [],
  scanSummary: overrides.scanSummary ?? null,
  actions: {
    canConfigure: false,
    canRun: false,
    canRescan: true,
    canCancel: false,
    canRetry: true,
    canDiscard: true,
    ...overrides.actions
  }
})

describe("jiraFailurePlan", () => {
  it("retries when Jira could not be reached", () => {
    expect(
      jiraFailurePlan(
        detail({ failure: { reason: "timeout", retryable: true } })
      )
    ).toEqual({
      kind: "jira_unreachable",
      primary: "retry",
      secondary: ["scan_again"]
    })
  })

  it("asks to reconnect when Jira access was lost", () => {
    expect(jiraFailurePlan(detail({ status: "reconnect_required" }))).toEqual({
      kind: "jira_access",
      primary: "reconnect",
      secondary: ["retry", "scan_again"]
    })
  })

  it("points at storage settings when storage is missing", () => {
    expect(
      jiraFailurePlan(
        detail({
          failure: { reason: "storage_unavailable", retryable: false },
          actions: { canRetry: false }
        })
      ).primary
    ).toBe("connect_storage")
  })

  it("offers only a new scan once an import stalled", () => {
    expect(
      jiraFailurePlan(
        detail({
          failure: { reason: "jira_migration_stalled", retryable: false },
          actions: { canRetry: false }
        })
      )
    ).toEqual({ kind: "stalled", primary: "scan_again", secondary: [] })
  })

  it("offers a new scan when the written project could not be verified", () => {
    expect(
      jiraFailurePlan(
        detail({
          failure: {
            reason: "jira_migration_publication_invalid",
            retryable: false
          },
          actions: { canRetry: false }
        })
      )
    ).toEqual({ kind: "verification", primary: "scan_again", secondary: [] })
  })

  it("never offers an action the server does not allow", () => {
    const plan = jiraFailurePlan(
      detail({
        failure: { reason: "something_new", retryable: false },
        actions: { canRetry: false, canRescan: false }
      })
    )
    expect(plan).toEqual({ kind: "unknown", primary: null, secondary: [] })
  })
})

describe("jiraStoppedActions", () => {
  it("offers only a new scan once an import was stopped or lost its scan", () => {
    expect(jiraStoppedActions(detail({}), "cancelled")).toEqual(["scan_again"])
    expect(
      jiraStoppedActions(
        detail({ actions: { canRescan: false } }),
        "unavailable"
      )
    ).toEqual([])
  })

  it("lists the failure plan in order for a failed import", () => {
    expect(
      jiraStoppedActions(
        detail({ failure: { reason: "timeout", retryable: true } }),
        "failed"
      )
    ).toEqual(["retry", "scan_again"])
  })
})
