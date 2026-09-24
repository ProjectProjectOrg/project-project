import * as Schema from "effect/Schema"
import { describe, expect, it } from "vitest"

import { INNER_RING, OUTER_RING } from "../colors"
import {
  BlockDraft,
  BlockKey,
  LibraryColor,
  TemplateDraft,
  TemplateKey,
  UpdateTemplateDefaultsInput,
  UpdateTemplateInput
} from "./Library"

const decodeBlockKey = Schema.decodeUnknownExit(BlockKey)
const decodeTemplateKey = Schema.decodeUnknownExit(TemplateKey)
const decodeColor = Schema.decodeUnknownExit(LibraryColor)
const decodeDefaults = Schema.decodeUnknownExit(UpdateTemplateDefaultsInput)

describe("library keys", () => {
  it("accepts kebab-case keys up to 48 characters", () => {
    for (const key of [
      "notes",
      "acceptance-criteria",
      "a1-b2",
      "a".repeat(48)
    ]) {
      expect(decodeBlockKey(key)._tag).toBe("Success")
      expect(decodeTemplateKey(key)._tag).toBe("Success")
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

  it("reserves blank for templates only", () => {
    expect(decodeTemplateKey("blank")._tag).toBe("Failure")
    expect(decodeBlockKey("blank")._tag).toBe("Success")
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

describe("UpdateTemplateDefaultsInput", () => {
  it("accepts a partial mapping with explicit blanks", () => {
    expect(
      decodeDefaults({ defaults: { bug: "bug-report", other: null } })._tag
    ).toBe("Success")
    expect(decodeDefaults({ defaults: {} })._tag).toBe("Success")
  })

  it("accepts types to reset to the inherited default", () => {
    expect(decodeDefaults({ defaults: {}, reset: ["bug", "feat"] })._tag).toBe(
      "Success"
    )
    expect(decodeDefaults({ defaults: {}, reset: ["nope"] })._tag).toBe(
      "Failure"
    )
  })

  it("rejects the reserved blank key", () => {
    expect(decodeDefaults({ defaults: { bug: "blank" } })._tag).toBe("Failure")
  })
})

describe("TemplateDraft", () => {
  it("drops the retired type field that older clients still send", () => {
    const draft = Schema.decodeUnknownSync(TemplateDraft)({
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
    expect(
      "type" in Schema.decodeUnknownSync(UpdateTemplateInput)({ type: "bug" })
    ).toBe(false)
  })
})
