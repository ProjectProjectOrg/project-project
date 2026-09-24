import { formatTicketBlock, type Library } from "@pp/shared"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Markdown } from "@/components/Markdown"

import { BUILTIN_LIBRARY, LibraryContext } from "./blockChrome"
import { syncedEditAction } from "./SyncedBlock"

afterEach(cleanup)

const DOD = "definition-of-done"

const STALE = formatTicketBlock(
  DOD,
  "## Definition of done\n\n- [x] Reviewed and merged\n- [ ] Old item",
  { sync: true }
)

const renderWith = (library: Library, body: string) =>
  render(
    <LibraryContext.Provider value={library}>
      <Markdown>{body}</Markdown>
    </LibraryContext.Provider>
  )

describe("read-only synced blocks", () => {
  it("shows the current definition with ticks, a dashed frame and the chip", () => {
    const { container } = renderWith(BUILTIN_LIBRARY, STALE)
    const frame = container.querySelector(".ticket-block")
    expect(frame?.hasAttribute("data-sync")).toBe(true)
    expect(screen.getByText("Verified in the target environment")).toBeDefined()
    expect(screen.queryByText("Old item")).toBeNull()
    expect(screen.getByText(/^Synced from/)).toBeDefined()
    const boxes = container.querySelectorAll<HTMLInputElement>(
      "input[type=checkbox]"
    )
    expect(boxes[0].checked).toBe(true)
    expect(boxes[0].disabled).toBe(true)
  })

  it("renders a deleted definition as a copy with a note", () => {
    const library: Library = {
      ...BUILTIN_LIBRARY,
      blocks: BUILTIN_LIBRARY.blocks.filter((block) => block.key !== DOD)
    }
    const { container } = renderWith(library, STALE)
    expect(
      container.querySelector(".ticket-block")?.hasAttribute("data-sync")
    ).toBe(false)
    expect(screen.getByText("Source removed, now a copy")).toBeDefined()
    expect(screen.getByText("Old item")).toBeDefined()
  })
})

describe("syncedEditAction", () => {
  const ADOPTED: Library = { ...BUILTIN_LIBRARY }
  const ALL = { org: true, project: true }
  const NONE = { org: false, project: false }

  it("never offers edit while the library is the built-in gallery", () => {
    expect(syncedEditAction(BUILTIN_LIBRARY, "org", ALL)).toBe("none")
    expect(syncedEditAction(BUILTIN_LIBRARY, "project", NONE)).toBe("none")
  })

  it("offers edit on the layer the viewer can change", () => {
    expect(
      syncedEditAction(ADOPTED, "org", { org: true, project: false })
    ).toBe("edit")
    expect(
      syncedEditAction(ADOPTED, "org", { org: false, project: true })
    ).toBe("managed")
    expect(syncedEditAction(ADOPTED, "project", NONE)).toBe("managed")
  })
})
