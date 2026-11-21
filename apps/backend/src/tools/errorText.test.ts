import { it } from "@effect/vitest"
import {
  type ToolError,
  Forbidden,
  InvalidBlocks,
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
    expect(
      toolErrorMessage(new Validation({ reason: "position_is_self" }))
    ).toBe("Validation error (position_is_self).")
  })

  it("maps InvalidBlocks to the formatted issue text", () => {
    const text = toolErrorMessage(
      new InvalidBlocks({
        code: "malformed_open",
        line: 3,
        source: '<block type="foo">'
      })
    )
    expect(text).toContain("Invalid block markup")
    expect(text).toContain("line 3:")
    expect(text).toContain("list_blocks")
  })

  it("ends the block issue as a sentence before pointing at list_blocks", () => {
    expect(
      toolErrorMessage(
        new InvalidBlocks({
          code: "unclosed",
          line: 2,
          source: '<block type="notes">'
        })
      )
    ).toBe(
      'Invalid block markup: line 2: <block type="notes"> is never closed. ' +
        "Discover valid block types via list_blocks, and see the " +
        "create_ticket/update_ticket descriptions for the format."
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
