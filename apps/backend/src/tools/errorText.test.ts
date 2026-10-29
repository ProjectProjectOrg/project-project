import { it } from "@effect/vitest"
import {
  type ToolError,
  Forbidden,
  NotFound,
  Unauthorized,
  Validation
} from "@pp/shared"
import { Effect, Schema } from "effect"
import * as Data from "effect/Data"
import { describe, expect } from "vitest"

import { toolErrorMessage } from "./errorText"

const TestErrors = Data.taggedEnum<Readonly<{ _tag: "NotADomainError" }>>()

const decodeUnknownString = Schema.decodeUnknownEffect(Schema.String)

describe("toolErrorMessage", () => {
  it("maps Unauthorized", () => {
    const declared: ToolError = new Unauthorized()
    expect(toolErrorMessage(declared)).toContain("Unauthorized")
  })

  it("maps NotFound to Not found", () => {
    expect(toolErrorMessage(new NotFound())).toContain("Not found")
  })

  it("maps Forbidden", () => {
    expect(toolErrorMessage(new Forbidden())).toContain("Forbidden")
  })

  it("maps Validation with reason", () => {
    expect(toolErrorMessage(new Validation({ reason: "bad_input" }))).toBe(
      "Validation error (bad_input)."
    )
  })

  it("maps a block_markup Validation reason to the formatted issue text", () => {
    const text = toolErrorMessage(
      new Validation({
        reason:
          'block_markup:line 3: <block type="foo"> is not a valid block ' +
          'opener; write <block type="key"> or <block type="key" sync>'
      })
    )
    expect(text).toContain("Invalid block markup")
    expect(text).toContain("line 3:")
    expect(text).toContain("list_blocks")
    expect(text).not.toContain("Validation error (")
  })

  it("ends the block issue as a sentence before pointing at list_blocks", () => {
    expect(
      toolErrorMessage(
        new Validation({
          reason: 'block_markup:line 2: <block type="notes"> is never closed'
        })
      )
    ).toBe(
      'Invalid block markup: line 2: <block type="notes"> is never closed. ' +
        "Discover valid block types via list_blocks, and see the " +
        "create_ticket/update_ticket descriptions for the format."
    )
  })

  it("names an unknown template key and points at list_templates", () => {
    const text = toolErrorMessage(
      new Validation({ reason: "unknown_template:bug-report" })
    )
    expect(text).toBe(
      'Unknown template "bug-report". Discover the project\'s template keys ' +
        "via list_templates, or omit template for a blank ticket."
    )
  })

  it("leaves untagged values unmapped for the caller to treat as internal", () => {
    expect(toolErrorMessage(new Error("boom"))).toBeUndefined()
  })

  it("leaves unknown tags unmapped", () => {
    expect(toolErrorMessage(TestErrors.NotADomainError())).toBeUndefined()
  })

  it.effect("preserves schema validation details", () =>
    Effect.gen(function* () {
      const error = yield* decodeUnknownString(42).pipe(Effect.flip)
      const result = toolErrorMessage(error)
      expect(result).toContain("Validation error:")
    })
  )
})
