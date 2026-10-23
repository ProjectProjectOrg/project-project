import { describe, expect, it } from "vitest"

import { m } from "@/paraglide/messages"

import { formatShortcut } from "./command-menu"

describe("formatShortcut", () => {
  it("draws modifier glyphs on a Mac", () => {
    expect(formatShortcut("mod+shift+enter", true)).toEqual(["⌘", "⇧", "↵"])
  })

  it("spells keys through the translated labels elsewhere", () => {
    expect(formatShortcut("mod+tab", false)).toEqual([
      m.common_key_ctrl(),
      m.common_key_tab()
    ])
    expect(formatShortcut("esc", true)).toEqual([m.common_key_escape()])
  })
})
