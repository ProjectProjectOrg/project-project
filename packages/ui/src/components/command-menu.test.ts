import { describe, expect, it } from "vitest"

import { formatShortcut, type KeyLabels } from "./command-menu"

const labels: KeyLabels = {
  ctrl: "Ctrl",
  meta: "Win",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Del",
  tab: "Tab",
  space: "Space"
}

describe("formatShortcut", () => {
  it("draws modifier glyphs on a Mac", () => {
    expect(formatShortcut("mod+shift+enter", true, labels)).toEqual([
      "⌘",
      "⇧",
      "↵"
    ])
  })

  it("spells keys through the given labels elsewhere", () => {
    expect(formatShortcut("mod+tab", false, labels)).toEqual(["Ctrl", "Tab"])
    expect(formatShortcut("esc", true, labels)).toEqual(["Esc"])
  })
})
