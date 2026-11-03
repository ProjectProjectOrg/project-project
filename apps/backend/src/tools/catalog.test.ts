import { describe, expect, test } from "@effect/vitest"
import { ToolCli, Tools, withoutDescriptions } from "@pp/shared"
import Ajv from "ajv"
import { Tool } from "effect/ai"
import * as Context from "effect/Context"
import * as Option from "effect/Option"
import * as Record from "effect/Record"

import legacy from "./__fixtures__/legacyInputSchemas.json"

const fixtures = {
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
} satisfies Partial<Record<keyof typeof Tools.tools, ReadonlyArray<unknown>>>

const tools = Record.values(Tools.tools)

describe("Tools", () => {
  test("me uses Effect's empty-object parameter schema", () => {
    expect(Tool.getJsonSchema(Tools.tools.me)).toEqual({
      type: "object",
      additionalProperties: false
    })
  })

  test("input schemas are structurally identical to the legacy schemas", () => {
    for (const tool of tools) {
      const { $defs, ...before } = legacy[tool.name]
      expect($defs).toEqual({})
      expect(withoutDescriptions(Tool.getJsonSchema(tool)), tool.name).toEqual(
        before
      )
    }
  })

  test("input schemas accept and reject the same inputs as before", () => {
    const ajv = new Ajv({ strict: false, allErrors: true })
    for (const [name, inputs] of Record.toEntries(fixtures)) {
      const before = ajv.compile(legacy[name])
      const after = ajv.compile(Tool.getJsonSchema(Tools.tools[name]))
      for (const input of inputs) {
        expect(after(input), `${name} ${JSON.stringify(input)}`).toBe(
          before(input)
        )
      }
    }
  })

  test("every tool has its own CLI command whose arguments are inputs", () => {
    const commands = tools.map((tool) => {
      const cli = Context.getOption(tool.annotations, ToolCli)
      expect(Option.isSome(cli), tool.name).toBe(true)
      const { command, args = [] } = Option.getOrThrow(cli)
      const fields = Object.keys(Tool.getJsonSchema(tool).properties ?? {})
      for (const arg of args) expect(fields, tool.name).toContain(arg)
      return command.join(" ")
    })
    expect(new Set(commands).size).toBe(commands.length)
  })
})
