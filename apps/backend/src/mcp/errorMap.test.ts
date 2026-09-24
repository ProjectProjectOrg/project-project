import { it } from "@effect/vitest"
import { Forbidden, NotFound, Unauthorized, Validation } from "@pp/shared"
import { Effect, Schema } from "effect"
import { describe, expect } from "vitest"

import { mapToolError } from "./errorMap"

describe("mapToolError", () => {
  it("maps Unauthorized to a structured isError result", () => {
    const result = mapToolError(new Unauthorized())
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("Unauthorized")
  })

  it("maps NotFound to Not found", () => {
    const result = mapToolError(new NotFound())
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("Not found")
  })

  it("maps Forbidden", () => {
    const result = mapToolError(new Forbidden())
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("Forbidden")
  })

  it("maps Validation with reason", () => {
    const result = mapToolError(new Validation({ reason: "bad_input" }))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("Validation")
  })

  it("maps a block_markup Validation reason to the formatted issue text", () => {
    const result = mapToolError(
      new Validation({
        reason:
          'block_markup:line 3: <block type="foo"> is not a valid block ' +
          'opener; write <block type="key"> or <block type="key" sync>'
      })
    )
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("Invalid block markup")
    expect(result.content[0].text).toContain("line 3:")
    expect(result.content[0].text).toContain("list_blocks")
    expect(result.content[0].text).not.toContain("Validation error (")
  })

  it("maps unknown defects to a generic Internal error", () => {
    const result = mapToolError(new Error("boom"))
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("Internal error")
  })

  it.effect("preserves schema validation details", () =>
    Effect.gen(function* () {
      const error = yield* Schema.decodeUnknownEffect(Schema.String)(42).pipe(
        Effect.flip
      )
      const result = mapToolError(error)
      expect(result.content[0].text).toContain("Validation error:")
    })
  )
})
