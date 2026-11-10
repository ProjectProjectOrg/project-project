import { describe, expect, it } from "vitest"

import {
  jiraImportScreen,
  jiraImportStage,
  jiraLandingStep,
  type JiraImportScreenInput
} from "./stages"

const input = (
  overrides: Partial<JiraImportScreenInput>
): JiraImportScreenInput => ({
  status: "needs_configuration",
  hasScan: true,
  canConfigure: true,
  step: undefined,
  reconfigure: false,
  landing: "setup",
  ...overrides
})

describe("jiraImportScreen", () => {
  it("follows the URL step while the import is being set up", () => {
    expect(jiraImportScreen(input({}))).toBe("setup")
    expect(jiraImportScreen(input({ step: "scan" }))).toBe("scan-summary")
    expect(jiraImportScreen(input({ step: "review", status: "ready" }))).toBe(
      "review"
    )
  })

  it("shows running work regardless of the URL step", () => {
    expect(
      jiraImportScreen(input({ status: "scanning", step: "review" }))
    ).toBe("scan-progress")
    expect(jiraImportScreen(input({ status: "cancelling" }))).toBe(
      "import-progress"
    )
    expect(jiraImportScreen(input({ status: "succeeded" }))).toBe("result")
  })

  it("shows a stopped import's state over a stale URL step", () => {
    expect(jiraImportScreen(input({ status: "failed" }))).toBe("failed")
    expect(jiraImportScreen(input({ status: "failed", step: "review" }))).toBe(
      "failed"
    )
    expect(
      jiraImportScreen(input({ status: "cancelled", step: "setup" }))
    ).toBe("cancelled")
    expect(
      jiraImportScreen(input({ status: "reconnect_required", step: "review" }))
    ).toBe("reconnect")
  })

  it("lets a stopped import return to set up only when asked", () => {
    expect(
      jiraImportScreen(
        input({ status: "failed", step: "setup", reconfigure: true })
      )
    ).toBe("setup")
    expect(
      jiraImportScreen(
        input({
          status: "failed",
          step: "setup",
          reconfigure: true,
          canConfigure: false
        })
      )
    ).toBe("failed")
    expect(jiraImportScreen(input({ hasScan: false }))).toBe("unavailable")
  })
})

describe("stages and landing", () => {
  it("puts a failure before the scan finished under Scan", () => {
    expect(jiraImportStage("failed", false)).toBe("scan")
    expect(jiraImportStage("failed", true)).toBe("import")
  })

  it("lands on the scan summary first, then on what needs attention", () => {
    expect(jiraLandingStep(false, true)).toBe("scan")
    expect(jiraLandingStep(true, true)).toBe("setup")
    expect(jiraLandingStep(true, false)).toBe("review")
  })
})
