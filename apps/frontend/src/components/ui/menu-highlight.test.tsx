import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "./dropdown-menu"
import {
  MenuHighlight,
  nextHighlight,
  type HighlightRect
} from "./menu-highlight"

afterEach(cleanup)

const rect = (top: number): HighlightRect => ({
  top,
  left: 4,
  width: 200,
  height: 32,
  tone: "default"
})

const place = (element: HTMLElement, top: number) => {
  Object.defineProperty(element, "offsetTop", {
    value: top,
    configurable: true
  })
  Object.defineProperty(element, "offsetHeight", {
    value: 32,
    configurable: true
  })
  Object.defineProperty(element, "offsetWidth", {
    value: 200,
    configurable: true
  })
}

const bar = () =>
  document.querySelector<HTMLElement>('[data-slot="menu-highlight"]')

describe("nextHighlight", () => {
  it("keeps the session while the highlight moves between rows", () => {
    const first = nextHighlight({ rect: null, session: 0 }, rect(0))
    expect(first.session).toBe(1)
    const moved = nextHighlight(first, rect(32))
    expect(moved.session).toBe(1)
    expect(moved.rect?.top).toBe(32)
  })

  it("starts a new session after the highlight clears", () => {
    const cleared = nextHighlight({ rect: rect(0), session: 1 }, null)
    expect(cleared.session).toBe(1)
    expect(nextHighlight(cleared, rect(64)).session).toBe(2)
  })

  it("returns the same state when nothing changed", () => {
    const state = { rect: rect(0), session: 1 }
    expect(nextHighlight(state, rect(0))).toBe(state)
  })
})

function List() {
  return (
    <div role="listbox" className="relative">
      <MenuHighlight />
      <div role="option" aria-selected={false}>
        One
      </div>
      <div role="option" aria-selected={false} data-variant="destructive">
        Two
      </div>
    </div>
  )
}

describe("MenuHighlight", () => {
  it("follows the highlighted row with one bar", async () => {
    render(<List />)
    const [one, two] = screen.getAllByRole("option")
    place(one, 4)
    place(two, 36)
    expect(bar()).toBeNull()

    act(() => one.setAttribute("data-highlighted", ""))
    await waitFor(() => expect(bar()).not.toBeNull())
    const first = bar()
    expect(first?.dataset.tone).toBe("default")

    act(() => {
      one.removeAttribute("data-highlighted")
      two.setAttribute("data-highlighted", "")
    })
    await waitFor(() => expect(bar()?.dataset.tone).toBe("destructive"))
    expect(bar()).toBe(first)
  })
})

describe("DropdownMenu highlight bar", () => {
  it("renders the moving bar under the highlighted item", async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<button>Actions</button>} />
        <DropdownMenuContent>
          <DropdownMenuItem>Rename</DropdownMenuItem>
          <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
    const trigger = screen.getByRole("button", { name: "Actions" })
    act(() => trigger.focus())
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    const rename = await screen.findByRole("menuitem", { name: "Rename" })
    fireEvent.keyUp(trigger, { key: "ArrowDown" })
    await waitFor(() =>
      expect(rename.hasAttribute("data-highlighted")).toBe(true)
    )
    await waitFor(() => expect(bar()).not.toBeNull())
    expect(bar()?.parentElement?.parentElement).toBe(
      rename.closest('[data-slot="dropdown-menu-content"]')
    )
    expect(rename.className).not.toContain("bg-accent")
  })
})
