import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { INNER_RING, OUTER_RING } from "../colors"
import { BlockDraft, BlockKey, LibraryColor } from "./Library"

const decodeBlockKey = Schema.decodeUnknownExit(BlockKey)
const decodeColor = Schema.decodeUnknownExit(LibraryColor)

describe("library keys", () => {
  it("accepts kebab-case keys up to 48 characters", () => {
    for (const key of [
      "notes",
      "acceptance-criteria",
      "a1-b2",
      "a".repeat(48)
    ]) {
      expect(decodeBlockKey(key)._tag).toBe("Success")
    }
  })

  it("rejects malformed and overlong keys", () => {
    for (const key of [
      "",
      "Notes",
      "two words",
      "-lead",
      "trail-",
      "double--dash",
      "a".repeat(49)
    ]) {
      expect(decodeBlockKey(key)._tag).toBe("Failure")
    }
  })
})

describe("LibraryColor", () => {
  it("accepts wheel swatches in any case, and null", () => {
    expect(decodeColor(OUTER_RING[0].hex)._tag).toBe("Success")
    expect(decodeColor(INNER_RING[3].hex.toUpperCase())._tag).toBe("Success")
    expect(decodeColor(null)._tag).toBe("Success")
  })

  it("defaults a missing colour to none", () => {
    const draft = Schema.decodeSync(BlockDraft)({
      key: "notes",
      name: "Notes",
      icon: "NotebookPen",
      description: "",
      sync: false,
      content: "## Notes"
    })
    expect(draft.color).toBeNull()
  })

  it("rejects colours off the wheel", () => {
    expect(decodeColor("#123456")._tag).toBe("Failure")
    expect(decodeColor("red")._tag).toBe("Failure")
  })
})
