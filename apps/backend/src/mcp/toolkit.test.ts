import { describe, expect, test } from "vite-plus/test"
import Ajv from "ajv"
import * as Effect from "effect/Effect"
import { Tool } from "effect/unstable/ai"
import { McpTools, NotFound, Validation } from "@projectproject/shared"
import legacy from "./__fixtures__/legacyInputSchemas.json"
import { McpToolkit, toolFailure } from "./toolkit"

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
  test("exposes exactly the catalog's tool names", () => {
    expect(Object.keys(McpToolkit.tools).sort()).toEqual(
      Object.keys(McpTools).sort()
    )
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
      await Effect.runPromise(
        Effect.flip(toolFailure(Effect.fail(new NotFound())))
      )
    ).toBe("Not found.")
    expect(
      await Effect.runPromise(
        Effect.flip(
          toolFailure(Effect.fail(new Validation({ reason: "title required" })))
        )
      )
    ).toBe("Validation error (title required).")
    expect(
      await Effect.runPromise(Effect.flip(toolFailure(Effect.die("boom"))))
    ).toBe("Internal error.")
  })
})
