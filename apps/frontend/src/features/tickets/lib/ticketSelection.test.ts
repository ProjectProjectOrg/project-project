import { TicketStatus } from "@pp/shared"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  emptySelection,
  suggestedStatus,
  toggleSelection
} from "./ticketSelection"

const order = ["a", "b", "c", "d", "e"]

const selected = (keys: ReadonlyArray<string>, anchor: string) => ({
  keys: new Set(keys),
  anchor
})

describe("toggleSelection", () => {
  it("toggles one key and makes it the anchor", () => {
    const once = toggleSelection(emptySelection, "b")
    expect(once).toEqual(selected(["b"], "b"))
    expect(toggleSelection(once, "b")).toEqual(selected([], "b"))
  })

  it("applies the anchor's state to the range in either direction", () => {
    expect(toggleSelection(selected(["d"], "d"), "b", order)).toEqual(
      selected(["b", "c", "d"], "b")
    )
    expect(
      toggleSelection(selected(["a", "c", "e"], "b"), "e", order).keys
    ).toEqual(new Set(["a"]))
  })

  it("starts a new selection when the key is in another project", () => {
    expect(
      toggleSelection(selected(["web/T-1", "web/T-2"], "web/T-2"), "api/T-1")
    ).toEqual(selected(["api/T-1"], "api/T-1"))
  })

  it("keeps a range inside the clicked ticket's project", () => {
    const mixed = ["web/T-1", "api/T-1", "web/T-2"]
    expect(
      toggleSelection(selected(["web/T-1"], "web/T-1"), "web/T-2", mixed).keys
    ).toEqual(new Set(["web/T-1", "web/T-2"]))
  })

  it("toggles alone when the anchor is outside the range", () => {
    expect(toggleSelection(selected(["x"], "x"), "c", order)).toEqual(
      selected(["x", "c"], "c")
    )
  })
})

const status = Schema.decodeSync(TicketStatus)

describe("suggestedStatus", () => {
  const workflow = ["todo", "in_progress", "done"].map((each) => status(each))

  it("moves the selection to the status after its most common one", () => {
    expect(
      suggestedStatus(
        ["todo", "todo", "in_progress"].map((each) => status(each)),
        workflow
      )
    ).toBe("in_progress")
  })

  it("suggests nothing when most tickets are in the last status", () => {
    expect(suggestedStatus([status("done")], workflow)).toBeNull()
  })
})
