import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { BUILTIN_LIBRARY, lookupFor } from "@/components/blocks/blockChrome"

import { BlockMenu } from "./BlockMenu"
import type { BlockMenuModel } from "./blockMenuModel"
import { SNAP_BACK_MS } from "./useSnapBack"

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const notes = lookupFor(BUILTIN_LIBRARY)("notes") ?? null

const COPY: BlockMenuModel = {
  key: "7",
  blockType: "notes",
  name: "Notes",
  icon: "NotebookPen",
  color: null,
  kind: "copy",
  subtitle: "Edited",
  content: "## Notes\n\nSome notes.",
  canMoveUp: true,
  canMoveDown: false,
  definition: "edited",
  definitionTarget: notes,
  resetsTo: "definition"
}

function renderMenu(model: BlockMenuModel) {
  const onAction = vi.fn<(model: BlockMenuModel, action: string) => void>()
  const onClose = vi.fn<() => void>()
  const anchor = document.createElement("button")
  document.body.append(anchor)
  render(
    <BlockMenu
      model={model}
      anchor={anchor}
      finalFocus={null}
      onClose={onClose}
      onAction={onAction}
    />
  )
  return { onAction, onClose }
}

const item = (name: string | RegExp) => screen.getByRole("menuitem", { name })

it("shows the block name, its status and the copy actions", async () => {
  renderMenu(COPY)
  expect(await screen.findByText("Notes")).toBeDefined()
  expect(screen.getByText("Edited")).toBeDefined()
  for (const name of [
    /Move up/,
    /Move down/,
    "Duplicate",
    "Reset to definition",
    "Make this the definition",
    "Remove wrapper",
    "Remove block"
  ])
    expect(item(name)).toBeDefined()
  expect(screen.queryByRole("menuitem", { name: "Detach" })).toBeNull()
  expect(item(/Move down/).getAttribute("aria-disabled")).toBe("true")
})

it("shows the block icon in the header", async () => {
  renderMenu(COPY)
  const header = (await screen.findByText("Notes")).closest(
    "div"
  )?.parentElement
  expect(
    header?.querySelector("[data-block-icon]")?.getAttribute("data-block-icon")
  ).toBe("NotebookPen")
})

it("asks for a second click before resetting an edited block", async () => {
  const { onAction } = renderMenu(COPY)
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Reset to definition" })
  )
  expect(onAction).not.toHaveBeenCalled()
  expect(screen.getByText("Discard your edits?")).toBeDefined()
  fireEvent.click(item("Discard edits and reset"))
  expect(onAction).toHaveBeenCalledWith(COPY, "reset")
})

it("asks before writing the block back to its definition", async () => {
  const { onAction } = renderMenu(COPY)
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Make this the definition" })
  )
  expect(onAction).not.toHaveBeenCalled()
  fireEvent.click(item("Overwrite the definition with this block"))
  expect(onAction).toHaveBeenCalledWith(COPY, "make-definition")
})

it("snaps an armed confirm back after the timeout", async () => {
  renderMenu(COPY)
  const reset = await screen.findByRole("menuitem", {
    name: "Reset to definition"
  })
  vi.useFakeTimers()
  fireEvent.click(reset)
  expect(item("Discard edits and reset")).toBeDefined()
  act(() => {
    vi.advanceTimersByTime(SNAP_BACK_MS - 1)
  })
  expect(item("Discard edits and reset")).toBeDefined()
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(item("Reset to definition")).toBeDefined()
  expect(
    screen.queryByRole("menuitem", { name: "Discard edits and reset" })
  ).toBeNull()
})

it("cancels an armed confirm without running it", async () => {
  const { onAction } = renderMenu(COPY)
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Reset to definition" })
  )
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  expect(onAction).not.toHaveBeenCalled()
  expect(item("Reset to definition")).toBeDefined()
})

it("resets a matching block straight away and hides make-definition without rights", async () => {
  const model: BlockMenuModel = {
    ...COPY,
    subtitle: "Matches definition",
    definition: "matches",
    definitionTarget: null
  }
  renderMenu(model)
  const reset = await screen.findByRole("menuitem", {
    name: "Reset to definition"
  })
  expect(reset.getAttribute("aria-disabled")).toBe("true")
  expect(
    screen.queryByRole("menuitem", { name: "Make this the definition" })
  ).toBeNull()
})

it("offers detach on synced blocks and passes the action through", async () => {
  const model: BlockMenuModel = {
    ...COPY,
    kind: "synced",
    subtitle: "Synced from built-in",
    definition: "none",
    definitionTarget: null,
    resetsTo: null
  }
  const { onAction } = renderMenu(model)
  expect(await screen.findByText("Synced from built-in")).toBeDefined()
  expect(
    screen.queryByRole("menuitem", { name: "Reset to definition" })
  ).toBeNull()
  fireEvent.click(item("Detach"))
  expect(onAction).toHaveBeenCalledWith(model, "detach")
  fireEvent.click(item("Remove block"))
  expect(onAction).toHaveBeenCalledWith(model, "remove")
})

it("reverts a customized block to a reference in a template", async () => {
  const model: BlockMenuModel = {
    ...COPY,
    subtitle: "Matches definition",
    definition: "matches",
    resetsTo: "reference"
  }
  const { onAction } = renderMenu(model)
  const revert = await screen.findByRole("menuitem", {
    name: "Revert to block"
  })
  expect(revert.getAttribute("aria-disabled")).toBeNull()
  expect(
    screen.queryByRole("menuitem", { name: "Reset to definition" })
  ).toBeNull()
  fireEvent.click(revert)
  fireEvent.click(item("Discard the customization and link the block"))
  expect(onAction).toHaveBeenCalledWith(model, "reset")
})
