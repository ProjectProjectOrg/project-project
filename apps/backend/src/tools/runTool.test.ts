import { describe, expect, it } from "@effect/vitest"
import { NotFound, ToolFailure, Validation } from "@pp/shared"
import * as Cause from "effect/Cause"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"

import { asToolFailure } from "./runTool"

const TestErrors = Data.taggedEnum<Readonly<{ _tag: "NotADomainError" }>>()

describe("asToolFailure", () => {
  it.effect("names the error and explains it the way agents read it", () =>
    Effect.gen(function* () {
      expect(
        yield* Effect.flip(asToolFailure(Effect.fail(new NotFound())))
      ).toEqual(new ToolFailure({ error: "NotFound", message: "Not found." }))
      expect(
        yield* Effect.flip(
          asToolFailure(
            Effect.fail(new Validation({ reason: "title required" }))
          )
        )
      ).toEqual(
        new ToolFailure({
          error: "Validation",
          message: "Validation error (title required)."
        })
      )
    })
  )

  it.effect("carries the text as the Error message MCP shows", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        asToolFailure(Effect.fail(new NotFound()))
      )
      expect(failure.message).toBe("Not found.")
    })
  )

  it.effect("passes a success through unchanged", () =>
    Effect.gen(function* () {
      expect(yield* asToolFailure(Effect.succeed({ ok: true }))).toEqual({
        ok: true
      })
    })
  )

  it.effect("dies on failures it can't explain, so they stay private", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(
        asToolFailure(Effect.fail(TestErrors.NotADomainError()))
      )
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true)
    })
  )

  it.effect("leaves defects as defects", () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(asToolFailure(Effect.die("boom")))
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true)
    })
  )
})
