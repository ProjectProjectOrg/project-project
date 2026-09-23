import { it } from "@effect/vitest"
import {
  type McpToolError,
  Forbidden,
  NotFound,
  Unauthorized,
  Validation
} from "@pp/shared"
import { Effect, Schema } from "effect"
import { describe, expect } from "vitest"

import { mappedToolErrorText } from "./errorMap"

describe("mappedToolErrorText", () => {
  it("maps Unauthorized", () => {
    const declared: McpToolError = new Unauthorized()
    expect(mappedToolErrorText(declared)).toContain("Unauthorized")
  })

  it("maps NotFound to Not found", () => {
    expect(mappedToolErrorText(new NotFound())).toContain("Not found")
  })

  it("maps Forbidden", () => {
    expect(mappedToolErrorText(new Forbidden())).toContain("Forbidden")
  })

  it("maps Validation with reason", () => {
    expect(mappedToolErrorText(new Validation({ reason: "bad_input" }))).toBe(
      "Validation error (bad_input)."
    )
  })

  it("leaves untagged values unmapped for the caller to treat as internal", () => {
    expect(mappedToolErrorText(new Error("boom"))).toBeUndefined()
  })

  it("leaves unknown tags unmapped", () => {
    expect(mappedToolErrorText({ _tag: "NotADomainError" })).toBeUndefined()
  })

  it.effect("preserves schema validation details", () =>
    Effect.gen(function* () {
      const error = yield* Schema.decodeUnknownEffect(Schema.String)(42).pipe(
        Effect.flip
      )
      const result = mappedToolErrorText(error)
      expect(result).toContain("Validation error:")
    })
  )
})
