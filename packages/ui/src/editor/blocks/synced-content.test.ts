import type { Library } from "@pp/shared"
import { describe, expect, it } from "vitest"

import { BUILTIN_LIBRARY, lookupFor } from "./blockChrome"
import {
  hintsAsEmphasis,
  splitLeadingHeading,
  syncedDisplayContent,
  syncedView,
  toggleTaskAtLine
} from "./syncedContent"

const DOD = "definition-of-done"

const withBlocks = (
  edit: (blocks: Library["blocks"]) => Library["blocks"]
): Library => ({ ...BUILTIN_LIBRARY, blocks: edit(BUILTIN_LIBRARY.blocks) })

const SNAPSHOT = [
  "## Definition of done",
  "",
  "- [x] Reviewed and merged",
  "- [ ] Tests cover the change"
].join("\n")

describe("syncedView", () => {
  it("renders the live definition with this ticket's ticks", () => {
    const view = syncedView(lookupFor(BUILTIN_LIBRARY), DOD, SNAPSHOT, "synced")
    expect(view.kind).toBe("live")
    expect(view.content).toContain("- [x] Reviewed and merged")
    expect(view.content).toContain("- [ ] Docs updated where behaviour changed")
  })

  it("falls back to the snapshot when the definition is gone", () => {
    const library = withBlocks((blocks) =>
      blocks.filter((block) => block.key !== DOD)
    )
    expect(syncedView(lookupFor(library), DOD, SNAPSHOT, "synced")).toEqual({
      kind: "removed",
      content: SNAPSHOT
    })
  })

  it("treats a definition that is no longer synced as removed", () => {
    const library = withBlocks((blocks) =>
      blocks.map((block) =>
        block.key === DOD ? { ...block, sync: false } : block
      )
    )
    expect(syncedView(lookupFor(library), DOD, SNAPSHOT, "synced").kind).toBe(
      "removed"
    )
  })

  it("shows a reference as the definition without hints", () => {
    const view = syncedView(
      lookupFor(BUILTIN_LIBRARY),
      "steps-to-reproduce",
      "",
      "reference"
    )
    expect(view.kind).toBe("live")
    expect(view.content).not.toContain("{{")
  })
})

describe("syncedDisplayContent", () => {
  it("shows a linked block's hints, so empty task items stay checkboxes", () => {
    const view = syncedView(
      lookupFor(BUILTIN_LIBRARY),
      "acceptance-criteria",
      "",
      "reference"
    )
    if (view.kind !== "live") throw new Error("expected a live view")
    const shown = syncedDisplayContent(view, "reference")
    expect(shown).not.toContain("{{")
    expect(shown).toMatch(/^- \[ \] \*\S/m)
  })

  it("shows a synced block with this ticket's ticks", () => {
    const view = syncedView(lookupFor(BUILTIN_LIBRARY), DOD, SNAPSHOT, "synced")
    if (view.kind !== "live") throw new Error("expected a live view")
    expect(syncedDisplayContent(view, "synced")).toBe(view.content)
  })

  it("turns each hint into emphasis", () => {
    expect(hintsAsEmphasis("**Expected:** {{ what should happen }}")).toBe(
      "**Expected:** *what should happen*"
    )
  })
})

describe("toggleTaskAtLine", () => {
  it("ticks and unticks the task on a line", () => {
    const ticked = toggleTaskAtLine(SNAPSHOT, 4)
    expect(ticked).toContain("- [x] Tests cover the change")
    expect(toggleTaskAtLine(ticked, 3)).toContain("- [ ] Reviewed and merged")
  })

  it("leaves lines that are not tasks alone", () => {
    expect(toggleTaskAtLine(SNAPSHOT, 1)).toBe(SNAPSHOT)
    expect(toggleTaskAtLine(SNAPSHOT, 99)).toBe(SNAPSHOT)
  })
})

describe("splitLeadingHeading", () => {
  it("splits the first heading from the rest", () => {
    expect(splitLeadingHeading(SNAPSHOT)).toEqual({
      heading: "## Definition of done",
      rest: SNAPSHOT.split("\n").slice(1).join("\n")
    })
  })

  it("returns no heading when the block starts with text", () => {
    expect(splitLeadingHeading("Plain")).toEqual({
      heading: null,
      rest: "Plain"
    })
  })
})
