import { describe, expect, test } from "vite-plus/test"
import Ajv from "ajv"
import * as Effect from "effect/Effect"
import { Tool } from "effect/unstable/ai"
import { McpTools, NotFound, Validation } from "@projectproject/shared"
import legacy from "./__fixtures__/legacyInputSchemas.json"
import {
  McpToolkit,
  toToolkitHandlers,
  toolFailure,
  type McpHandlers
} from "./toolkit"

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

describe("toToolkitHandlers", () => {
  const stub = {
    me: () => Effect.succeed({ ok: true }),
    get_org: () => Effect.fail(new NotFound())
  } as unknown as McpHandlers<never>

  test("preserves the handler keys", () => {
    expect(Object.keys(toToolkitHandlers(stub))).toEqual(["me", "get_org"])
  })

  test("passes a success through unchanged", async () => {
    const handlers = toToolkitHandlers(stub) as unknown as Record<
      string,
      (input: unknown) => Effect.Effect<unknown, string>
    >
    expect(await Effect.runPromise(handlers.me({}))).toEqual({ ok: true })
  })

  test("maps a declared failure to the errorMap text", async () => {
    const handlers = toToolkitHandlers(stub) as unknown as Record<
      string,
      (input: unknown) => Effect.Effect<never, string>
    >
    expect(await Effect.runPromise(Effect.flip(handlers.get_org({})))).toBe(
      "Not found."
    )
  })

  test("wraps each handler in an mcp.tool.<name> span", async () => {
    const spans = {
      me: () => Effect.map(Effect.currentSpan, (span) => span.name)
    } as unknown as McpHandlers<never>
    const handlers = toToolkitHandlers(spans) as unknown as Record<
      string,
      (input: unknown) => Effect.Effect<unknown, string>
    >
    expect(await Effect.runPromise(handlers.me({}))).toBe("mcp.tool.me")
  })
})
