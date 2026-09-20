import { describe, expect, test } from "vite-plus/test"
import Ajv from "ajv"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Schema from "effect/Schema"
import { Tool } from "effect/unstable/ai"
import { McpTools, NotFound, Validation } from "@projectproject/shared"
import legacy from "./__fixtures__/legacyInputSchemas.json"
import { handle, McpToolFailure, McpToolkit, toolFailure } from "./toolkit"

const fixtures: Record<string, ReadonlyArray<unknown>> = {
  me: [{}, [], { extra: 1 }],
  create_ticket: [
    { orgSlug: "acme", projectSlug: "demo", title: "Valid ticket" },
    { orgSlug: "acme", projectSlug: "demo", title: "" },
    { orgSlug: "acme", projectSlug: "demo" },
    []
  ],
  list_tickets: [
    { orgSlug: "acme", projectSlug: "demo" },
    { orgSlug: "acme", projectSlug: "demo", limit: 10 },
    { orgSlug: "acme" }
  ],
  get_org: [{ orgSlug: "acme" }, {}]
}

describe("McpToolkit", () => {
  test("me uses Effect's empty-object parameter schema", () => {
    expect(Tool.getJsonSchema(McpToolkit.tools.me)).toEqual({
      type: "object",
      additionalProperties: false
    })
  })

  test("input schemas are structurally identical to the legacy schemas", () => {
    for (const name of Object.keys(McpTools)) {
      const { $defs, ...before } = legacy[
        name as keyof typeof legacy
      ] as Record<string, unknown>
      expect($defs).toEqual({})
      expect(
        Tool.getJsonSchema(
          McpToolkit.tools[name as keyof typeof McpToolkit.tools]
        ),
        name
      ).toEqual(before)
    }
  })

  test("input schemas accept and reject the same inputs as before", () => {
    const ajv = new Ajv({ strict: false, allErrors: true })
    for (const [name, inputs] of Object.entries(fixtures)) {
      const before = ajv.compile(legacy[name as keyof typeof legacy])
      const after = ajv.compile(
        Tool.getJsonSchema(
          McpToolkit.tools[name as keyof typeof McpToolkit.tools]
        )
      )
      for (const input of inputs) {
        expect(after(input), `${name} ${JSON.stringify(input)}`).toBe(
          before(input)
        )
      }
    }
  })

  test("toolFailure maps catalog errors to errorMap text", async () => {
    expect(
      (
        await Effect.runPromise(
          Effect.flip(toolFailure(Effect.fail(new NotFound())))
        )
      ).message
    ).toBe("Not found.")
    expect(
      (
        await Effect.runPromise(
          Effect.flip(
            toolFailure(
              Effect.fail(new Validation({ reason: "title required" }))
            )
          )
        )
      ).message
    ).toBe("Validation error (title required).")
  })

  test("toolFailure passes an already-mapped failure through untouched", async () => {
    const failure = new McpToolFailure({ message: "Not found." })
    expect(
      await Effect.runPromise(Effect.flip(toolFailure(Effect.fail(failure))))
    ).toBe(failure)
  })

  test("the failure carries the text as an Error message, not a JSON string", () => {
    const failure = new McpToolFailure({ message: "Not found." })
    expect(failure.message).toBe("Not found.")
    expect(Schema.is(McpToolFailure)(failure)).toBe(true)
  })

  test("toolFailure leaves defects for McpServer to scrub", async () => {
    const exit = await Effect.runPromiseExit(toolFailure(Effect.die("boom")))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true)
  })

  test("toolFailure dies unmapped failures so McpServer can scrub them", async () => {
    const exit = await Effect.runPromiseExit(
      toolFailure(Effect.fail({ _tag: "NotADomainError" }))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) expect(Cause.hasDies(exit.cause)).toBe(true)
  })
})

describe("handle", () => {
  test("passes a success through unchanged", async () => {
    const me = handle("me", () => Effect.succeed({ ok: true }))
    expect(await Effect.runPromise(me({}))).toEqual({ ok: true })
  })

  test("maps a declared failure to the errorMap text", async () => {
    const get_org = handle("get_org", () => Effect.fail(new NotFound()))
    expect(
      (await Effect.runPromise(Effect.flip(get_org({ orgSlug: "acme" }))))
        .message
    ).toBe("Not found.")
  })

  test("wraps each handler in an mcp.tool.<name> span", async () => {
    const me = handle("me", () =>
      Effect.map(Effect.currentSpan, (span) => span.name)
    )
    expect(await Effect.runPromise(me({}))).toBe("mcp.tool.me")
  })
})
