import { describe, expect, it } from "vitest"

import { toArchiveTicketInput } from "./opts"

const reason = (preset: string | null, details: string) =>
  toArchiveTicketInput({ preset, details }).reason

describe("toArchiveTicketInput", () => {
  it("joins the preset and trimmed details", () => {
    expect(reason("Duplicate", "  of T-12 ")).toBe("Duplicate: of T-12")
  })

  it("uses whichever part is present", () => {
    expect(reason("Won't do", " ")).toBe("Won't do")
    expect(reason(null, "stale")).toBe("stale")
  })

  it("sends no reason when nothing was given", () => {
    expect(reason(null, "  ")).toBeUndefined()
  })
})
