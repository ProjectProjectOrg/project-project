import { describe, expect, it } from "vitest"

import { checksColor } from "./checksColor"

describe("checksColor", () => {
  it("maps each check outcome to its state colour", () => {
    expect(checksColor("passing")).toBe("text-state-success")
    expect(checksColor("failing")).toBe("text-state-danger")
    expect(checksColor("pending")).toBe("text-state-warning")
  })

  it("falls back to muted for anything else", () => {
    expect(checksColor("none")).toBe("text-muted-foreground")
  })
})
