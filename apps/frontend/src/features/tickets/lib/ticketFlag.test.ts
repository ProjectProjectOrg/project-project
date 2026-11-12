import * as DateTime from "effect/DateTime"
import { describe, expect, it } from "vitest"

import { flagFor } from "./ticketFlag"

describe("flagFor", () => {
  const at = DateTime.toDate(DateTime.makeUnsafe("2026-11-12T09:00:00Z"))

  it("keeps a trimmed reason and drops a blank one", () => {
    expect(flagFor("  Waiting on the customer\n", "user-1", at)).toEqual({
      reason: "Waiting on the customer",
      by: "user-1",
      at
    })
    expect(flagFor(" \n ", "user-1", at)).toEqual({ by: "user-1", at })
  })
})
