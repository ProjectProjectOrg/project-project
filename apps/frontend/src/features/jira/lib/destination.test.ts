import { describe, expect, it } from "vitest"

import { conflictFor, conflictingFields, conflictMessages } from "./destination"

describe("conflictFor", () => {
  it("routes slug conflicts to the slug and the rest to the key", () => {
    const conflicts = [
      { kind: "project_slug" as const, value: "eng" },
      { kind: "ticket_id" as const, value: "ENG-1" }
    ]
    expect(conflictFor("name", conflicts)).toBeNull()
    expect(conflictFor("slug", conflicts)).toBe(
      "URL slug eng is already taken."
    )
    expect(conflictFor("key", conflicts)).toBe(
      "Ticket ENG-1 already exists. Pick another project key."
    )
  })

  it("collapses many taken ticket keys into one message", () => {
    const tickets = ["ENG-1", "ENG-2", "ENG-3", "ENG-4", "ENG-5"].map(
      (value) => ({ kind: "ticket_id" as const, value })
    )
    expect(conflictMessages(tickets)).toEqual([
      "5 tickets with this key already exist: ENG-1, ENG-2, ENG-3 and 2 more. Pick another project key."
    ])
  })

  it("names only the taken key when the key itself conflicts", () => {
    const conflicts = [
      { kind: "project_slug" as const, value: "eng" },
      { kind: "project_key" as const, value: "ENG" },
      { kind: "ticket_id" as const, value: "ENG-1" },
      { kind: "ticket_id" as const, value: "ENG-2" }
    ]
    expect(conflictFor("key", conflicts)).toBe(
      "Project key ENG is already taken. Pick another."
    )
    expect(conflictingFields(conflicts)).toBe(2)
  })
})
