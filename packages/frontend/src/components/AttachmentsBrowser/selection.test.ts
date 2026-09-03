import { describe, expect, it } from "vitest"
import type { AttachmentStatus } from "@projectproject/shared"
import {
  allDeletableSelected,
  deletableIds,
  hasMorePages,
  hasThumbnail,
  isDeletable,
  prunedSelection,
  toggleSelection
} from "./selection"

interface SelectableRow {
  readonly id: string
  readonly status: AttachmentStatus
}

const rows: ReadonlyArray<SelectableRow> = [
  { id: "live-1", status: "live" as const },
  { id: "orphan-1", status: "orphaned" as const },
  { id: "pending-1", status: "pending" as const },
  { id: "orphan-2", status: "orphaned" as const }
]

describe("isDeletable", () => {
  it("admits an orphaned attachment", () => {
    expect(isDeletable(rows[1])).toBe(true)
  })

  it("refuses a live attachment, which a description still renders", () => {
    expect(isDeletable(rows[0])).toBe(false)
  })

  it("refuses a pending attachment, whose upload may still land", () => {
    expect(isDeletable(rows[2])).toBe(false)
  })
})

describe("hasThumbnail", () => {
  it("shows a thumbnail for a live raster image", () => {
    expect(hasThumbnail({ status: "live", contentType: "image/png" })).toBe(
      true
    )
  })

  it("shows a thumbnail for an orphaned image, which still serves", () => {
    expect(hasThumbnail({ status: "orphaned", contentType: "image/png" })).toBe(
      true
    )
  })

  it("falls back for a pending image, whose object may not exist yet", () => {
    expect(hasThumbnail({ status: "pending", contentType: "image/png" })).toBe(
      false
    )
  })

  it("falls back for a live pdf, which has no rendered preview", () => {
    expect(
      hasThumbnail({ status: "live", contentType: "application/pdf" })
    ).toBe(false)
  })
})

describe("deletableIds", () => {
  it("picks out only the orphans, so select-all never arms a live row", () => {
    expect(deletableIds(rows)).toEqual(["orphan-1", "orphan-2"])
  })

  it("is empty when nothing is orphaned", () => {
    expect(deletableIds([rows[0], rows[2]])).toEqual([])
  })
})

describe("toggleSelection", () => {
  it("adds an id that was not selected", () => {
    expect([...toggleSelection(new Set(), "orphan-1")]).toEqual(["orphan-1"])
  })

  it("removes an id that was selected", () => {
    expect([...toggleSelection(new Set(["orphan-1"]), "orphan-1")]).toEqual([])
  })

  it("leaves the other selected ids alone", () => {
    const next = toggleSelection(new Set(["orphan-1", "orphan-2"]), "orphan-1")
    expect([...next]).toEqual(["orphan-2"])
  })
})

describe("prunedSelection", () => {
  it("drops ids the current rows no longer contain", () => {
    const next = prunedSelection(new Set(["orphan-1", "gone"]), rows)
    expect([...next]).toEqual(["orphan-1"])
  })

  it("drops an id whose row is no longer orphaned", () => {
    const next = prunedSelection(new Set(["live-1"]), rows)
    expect([...next]).toEqual([])
  })
})

describe("allDeletableSelected", () => {
  it("is true once every orphan is selected", () => {
    expect(allDeletableSelected(new Set(["orphan-1", "orphan-2"]), rows)).toBe(
      true
    )
  })

  it("is false while an orphan is unselected", () => {
    expect(allDeletableSelected(new Set(["orphan-1"]), rows)).toBe(false)
  })

  it("is false when there is nothing to select", () => {
    expect(allDeletableSelected(new Set(), [rows[0]])).toBe(false)
  })
})

describe("hasMorePages", () => {
  it("offers nothing more once the stream reported it is done", () => {
    expect(hasMorePages({ loaded: 100, pageSize: 50, done: true })).toBe(false)
  })

  it("treats a short page as the end, so a complete list stops offering more", () => {
    expect(hasMorePages({ loaded: 27, pageSize: 50, done: false })).toBe(false)
  })

  it("offers more after a full page", () => {
    expect(hasMorePages({ loaded: 50, pageSize: 50, done: false })).toBe(true)
  })

  it("offers more after several full pages", () => {
    expect(hasMorePages({ loaded: 100, pageSize: 50, done: false })).toBe(true)
  })

  it("offers nothing more for an empty list", () => {
    expect(hasMorePages({ loaded: 0, pageSize: 50, done: false })).toBe(false)
  })
})
