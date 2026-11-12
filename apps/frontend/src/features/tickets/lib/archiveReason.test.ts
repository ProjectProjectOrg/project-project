import { describe, expect, it } from "vitest"

import { archiveReason } from "./archiveReason"

describe("archiveReason", () => {
  it("joins the preset and trimmed details", () => {
    expect(archiveReason("Duplicate", "  of T-12 ")).toBe("Duplicate: of T-12")
  })

  it("uses whichever part is present", () => {
    expect(archiveReason("Won't do", " ")).toBe("Won't do")
    expect(archiveReason(null, "stale")).toBe("stale")
  })

  it("is undefined when nothing was given", () => {
    expect(archiveReason(null, "  ")).toBeUndefined()
  })
})
