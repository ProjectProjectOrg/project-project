import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { m } from "@/paraglide/messages"

import {
  CommandMenu,
  CommandMenuFooter,
  CommandMenuItem,
  CommandMenuList,
  formatShortcut,
  type CommandMenuItemData
} from "./command-menu"

vi.stubGlobal("matchMedia", (query: string) => ({
  matches: false,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {}
}))

afterEach(cleanup)

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

const ITEMS: ReadonlyArray<CommandMenuItemData> = [
  { value: "heading", label: "Heading", group: "Markdown" },
  { value: "notes", label: "Notes", group: "Blocks" },
  { value: "quote", label: "Quote", group: "Markdown" }
]

describe("CommandMenu", () => {
  it("groups rows under their headings and picks a clicked row", () => {
    const onSelect = vi.fn()
    render(
      <CommandMenu items={ITEMS} onSelect={onSelect}>
        <CommandMenuList
          renderItem={(item) => (
            <CommandMenuItem value={item.value}>{item.label}</CommandMenuItem>
          )}
        />
        <CommandMenuFooter>footer</CommandMenuFooter>
      </CommandMenu>
    )

    const groups = screen.getAllByRole("group")
    expect(groups.map((group) => group.textContent)).toEqual([
      "MarkdownHeadingQuote",
      "BlocksNotes"
    ])
    expect(screen.getByText("footer")).toBeDefined()

    fireEvent.click(screen.getByRole("option", { name: "Notes" }))
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1])
  })
})
