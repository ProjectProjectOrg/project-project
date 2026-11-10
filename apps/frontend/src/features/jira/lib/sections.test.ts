import { describe, expect, it } from "vitest"

import { buildJiraImportDraft } from "./draft"
import { jiraCategoryLabel, jiraSectionSummary } from "./sections"
import { jiraSetupCounts } from "./setup"
import { testRequirements as requirements } from "./testRequirements"

const { setup } = buildJiraImportDraft(requirements, null)
const counts = jiraSetupCounts(setup, requirements, 0)

describe("jiraSectionSummary", () => {
  it("summarises statuses by how many they collapse onto", () => {
    expect(jiraSectionSummary("statuses", counts, setup)).toBe(
      "3 Jira statuses → 2 statuses"
    )
  })

  it("names the destination by name and key", () => {
    expect(jiraSectionSummary("destination", counts, setup)).toBe(
      "Engineering · ENG"
    )
  })
})

describe("jiraCategoryLabel", () => {
  it("labels Jira's status categories and ignores unknown ones", () => {
    expect(jiraCategoryLabel("indeterminate")).toBe("In progress in Jira")
    expect(jiraCategoryLabel("other")).toBeNull()
  })
})
