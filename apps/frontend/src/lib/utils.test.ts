import { describe, expect, it } from "vitest"

import { cn } from "./utils"

describe("cn", () => {
  it("treats type roles as font sizes, not colors", () => {
    expect(cn("text-xs", "text-caption text-muted-foreground")).toBe(
      "text-caption text-muted-foreground"
    )
  })
})
