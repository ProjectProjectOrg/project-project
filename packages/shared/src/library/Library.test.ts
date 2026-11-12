import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { INNER_RING, OUTER_RING } from "../colors"
import {
  BlockDraft,
  BlockKey,
  LibraryColor,
  TypeDraft,
  TypeKey,
  UpdateTypeInput
} from "./Library"

const decodeBlockDraftSync = Schema.decodeSync(BlockDraft)

const decodeUnknownTypeDraftSync = Schema.decodeUnknownSync(TypeDraft)

const decodeUnknownUpdateTypeInputSync =
  Schema.decodeUnknownSync(UpdateTypeInput)

const decodeBlockKey = Schema.decodeUnknownExit(BlockKey)
const decodeTypeKey = Schema.decodeUnknownExit(TypeKey)
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
      expect(decodeTypeKey(key)._tag).toBe("Success")
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

  it("reserves blank and other for types only", () => {
    for (const key of ["blank", "other"]) {
      expect(decodeTypeKey(key)._tag).toBe("Failure")
      expect(decodeBlockKey(key)._tag).toBe("Success")
    }
    expect(decodeTypeKey("other-work")._tag).toBe("Success")
  })
})

describe("LibraryColor", () => {
  it("accepts wheel swatches in any case, and null", () => {
    expect(decodeColor(OUTER_RING[0].hex)._tag).toBe("Success")
    expect(decodeColor(INNER_RING[3].hex.toUpperCase())._tag).toBe("Success")
    expect(decodeColor(null)._tag).toBe("Success")
  })

  it("defaults a missing colour to none", () => {
    const draft = decodeBlockDraftSync({
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

describe("TypeDraft", () => {
  it("drops the retired type field that older clients still send", () => {
    const draft = decodeUnknownTypeDraftSync({
      key: "bug-report",
      name: "Bug report",
      icon: "Bug",
      description: "",
      type: "bug",
      priority: null,
      tags: [],
      body: ""
    })
    expect("type" in draft).toBe(false)
    expect("type" in decodeUnknownUpdateTypeInputSync({ type: "bug" })).toBe(
      false
    )
  })

  it("has no key in an update, so a key can't change", () => {
    expect(
      "key" in
        decodeUnknownUpdateTypeInputSync({ key: "defect", name: "Defect" })
    ).toBe(false)
  })
})
