import { describe, expect, it } from "vitest"

import { m } from "@/paraglide/messages"

import { hotkeyCaps } from "./hotkeyCaps"

describe("hotkeyCaps", () => {
  it("draws glyphs on a Mac and names each cap after its key", () => {
    expect(hotkeyCaps("Mod+Shift+Enter", "mac")).toEqual([
      { key: "shift", label: "⇧" },
      { key: "meta", label: "⌘" },
      { key: "enter", label: "↵" }
    ])
  })

  it("spells keys through the translated labels elsewhere", () => {
    expect(hotkeyCaps("Mod+Tab", "windows").map((cap) => cap.label)).toEqual([
      m.common_key_ctrl(),
      m.common_key_tab()
    ])
    expect(hotkeyCaps("Escape", "mac").map((cap) => cap.label)).toEqual([
      m.common_key_escape()
    ])
  })
})
