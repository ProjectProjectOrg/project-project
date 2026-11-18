import { TagName } from "@pp/shared"
import { makeTicketDetail } from "@pp/shared/tickets/testing"
import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import {
  applyTicketDetailPatch,
  applyTicketPatch,
  fromBulkPatch,
  mergeTicketEdit
} from "./ticketPatch"

const base = makeTicketDetail({ title: "Before" })

describe("applyTicketPatch", () => {
  it("overrides only the provided fields", () => {
    const next = applyTicketPatch(base, { priority: "high" })
    expect(next.priority).toBe("high")
    expect(next.title).toBe("Before")
  })

  it("clears the estimate on null and keeps it when the patch omits it", () => {
    const estimated = {
      ...base,
      estimate: { unit: "tshirt", value: "M" } as const
    }
    expect(applyTicketPatch(estimated, { estimate: null }).estimate).toBeNull()
    expect(applyTicketPatch(estimated, { title: "Next" }).estimate).toEqual({
      unit: "tshirt",
      value: "M"
    })
  })

  it("ignores body, which is not part of a list row", () => {
    const next = applyTicketPatch(base, { body: "After" })
    expect(next).not.toHaveProperty("body", "After")
  })
})

describe("applyTicketDetailPatch", () => {
  it("also applies body", () => {
    const next = applyTicketDetailPatch(base, { body: "After", title: "Next" })
    expect(next.body).toBe("After")
    expect(next.title).toBe("Next")
  })
})

describe("mergeTicketEdit", () => {
  it("keeps every queued tag change instead of the last one", () => {
    const tag = Schema.decodeSync(TagName)
    const merged = mergeTicketEdit(
      { tags: { add: [tag("a")] }, priority: "low" },
      { tags: { add: [tag("b")] }, priority: "high" }
    )
    expect(merged.priority).toBe("high")
    expect(applyTicketPatch(base, merged).tags).toEqual(["a", "b"])
  })
})

describe("fromBulkPatch", () => {
  it("predicts a cleared flag", () => {
    expect(fromBulkPatch({ flag: null })).toEqual({ flag: null })
  })
})
