import { describe, expect, it } from "vitest"

import { jiraImportPhases, jiraPhaseSteps, jiraScanPhases } from "./phases"

const states = (steps: ReturnType<typeof jiraPhaseSteps>) =>
  steps.map((step) => step.state)

describe("jiraPhaseSteps", () => {
  it("marks earlier phases done and later ones pending", () => {
    expect(
      states(
        jiraPhaseSteps(jiraImportPhases, {
          phase: "import_attachments",
          done: 2,
          total: 10
        })
      )
    ).toEqual(["done", "done", "current", "pending", "pending", "pending"])
  })

  it("shows an unknown phase on its own", () => {
    expect(
      jiraPhaseSteps(jiraImportPhases, {
        phase: "cancelling",
        done: 0,
        total: null
      })
    ).toEqual([{ phase: "cancelling", state: "current", measured: true }])
  })

  it("completes a phase whose count reached its total", () => {
    const steps = jiraPhaseSteps(jiraScanPhases, {
      phase: "scan_details",
      done: 40,
      total: 40
    })

    expect(steps.map((step) => step.phase)).toEqual([
      "scan_issues",
      "scan_details",
      "scan_boards",
      "scan_finalize"
    ])
    expect(states(steps)).toEqual(["done", "done", "current", "pending"])
    expect(steps.some((step) => step.measured)).toBe(false)
  })

  it("keeps the waiting step only while the scan waits", () => {
    expect(
      jiraPhaseSteps(jiraScanPhases, {
        phase: "queued_scan",
        done: 0,
        total: null
      })[0]
    ).toEqual({ phase: "queued_scan", state: "current", measured: true })
  })

  it("treats an unknown phase of the same family as the last step", () => {
    expect(
      states(
        jiraPhaseSteps(jiraScanPhases, {
          phase: "scan_wrap_up",
          done: 0,
          total: null
        })
      )
    ).toEqual(["done", "done", "done", "current"])
    expect(
      states(
        jiraPhaseSteps(jiraImportPhases, {
          phase: "import_cleanup",
          done: 0,
          total: null
        })
      ).at(-1)
    ).toBe("current")
  })
})
