import { describe, expect, it } from "vitest"

import { scanFacts } from "./facts"

const counts = {
  identities: 3,
  statuses: 4,
  issueTypes: 2,
  priorities: 2,
  tags: 5,
  issues: 10,
  comments: 7,
  attachments: 1,
  groups: 22,
  restrictions: 0
}

describe("scanFacts", () => {
  it("never shows grouped counts as sprints and hides missing or empty extras", () => {
    const labels = scanFacts({ ...counts, epics: 0 }).map((fact) => fact.label)
    expect(labels).not.toContain("Sprints")
    expect(labels).not.toContain("Epics in Jira")
  })

  it("shows sprints and epics when the scan counted them", () => {
    const facts = scanFacts({ ...counts, epics: 2, sprints: 4 })
    expect(facts).toContainEqual({ label: "Sprints", value: 4 })
    expect(facts).toContainEqual({ label: "Epics in Jira", value: 2 })
  })
})
