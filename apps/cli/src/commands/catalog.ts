import { ToolCli, type ToolName, Tools } from "@pp/shared"
import type { Tool } from "effect/ai"
import { Argument, Command, Flag } from "effect/cli"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { callTool } from "../client/callTool"
import { printResult } from "../output/format"
import { currentScope, currentServer, requireSlug } from "./context"
import { type Field, fieldsOf, flagName } from "./fields"
import { toolInput } from "./input"
import { root } from "./root"

const SCOPE_FIELDS = new Set(["orgSlug", "projectSlug"])

const hints: Readonly<Record<Field["kind"], string>> = {
  string: "Text, or @file / @- to read it from a file or standard input.",
  integer: "A whole number.",
  number: "A number.",
  boolean: "",
  strings: "Repeat the flag for several values; pass '' to clear.",
  json: "JSON, or @file / @- to read it."
}

const describe = <P>(
  param: P,
  field: Field,
  withDescription: (description: string) => (param: P) => P
) =>
  withDescription(
    [
      field.description,
      hints[field.kind],
      field.required ? "Required." : undefined
    ]
      .filter((part) => part !== undefined && part !== "")
      .join(" ")
  )(param)

const argumentFor = (field: Field) => {
  const argument =
    field.description === undefined
      ? Argument.String(field.name)
      : Argument.String(field.name).pipe(
          Argument.withDescription(field.description)
        )
  return field.required ? argument : Argument.optional(argument)
}

const flagFor = (field: Field) => {
  const name = flagName(field.name)
  switch (field.kind) {
    case "integer":
      return Flag.optional(
        describe(Flag.Int(name), field, Flag.withDescription)
      )
    case "number":
      return Flag.optional(
        describe(Flag.Finite(name), field, Flag.withDescription)
      )
    case "boolean":
      return Flag.optional(
        describe(Flag.Boolean(name), field, Flag.withDescription)
      )
    case "strings":
      return describe(Flag.String(name), field, Flag.withDescription).pipe(
        Flag.atLeast(0)
      )
    case "string":
    case "json":
      return Flag.optional(
        describe(Flag.String(name), field, Flag.withDescription)
      )
  }
}

export type CatalogEntry = Readonly<{
  name: ToolName
  command: readonly [string, ...ReadonlyArray<string>]
  args: ReadonlyArray<string>
  fields: ReadonlyArray<Field>
  description: string
}>

const isToolName = (name: string): name is ToolName =>
  Object.hasOwn(Tools.tools, name)

const entryFor = (tool: Tool.Any): ReadonlyArray<CatalogEntry> => {
  const name = tool.name
  if (!isToolName(name)) return []
  return Option.match(Context.getOption(tool.annotations, ToolCli), {
    onNone: () => [],
    onSome: (cli) => {
      const entry: CatalogEntry = {
        name,
        command: cli.command,
        args: cli.args ?? [],
        fields: fieldsOf(tool),
        description: tool.description ?? ""
      }
      return [entry]
    }
  })
}

export const catalogEntries: ReadonlyArray<CatalogEntry> = Object.values(
  Tools.tools
).flatMap(entryFor)

const scopeFor = (fields: ReadonlyArray<Field>) =>
  Effect.gen(function* () {
    const scope = yield* currentScope
    const needs = (name: string) =>
      fields.some((field) => field.name === name && field.required)
    return {
      orgSlug: needs("orgSlug")
        ? Option.some(yield* requireSlug(scope.org, "org"))
        : scope.org,
      projectSlug: needs("projectSlug")
        ? Option.some(yield* requireSlug(scope.project, "project"))
        : scope.project
    }
  })

export const commandFor = (entry: CatalogEntry) => {
  const name = entry.command[entry.command.length - 1] ?? entry.name
  const fields = entry.fields.filter((field) => !SCOPE_FIELDS.has(field.name))
  const config = Object.fromEntries([
    ...entry.args.flatMap((arg) => {
      const field = fields.find((candidate) => candidate.name === arg)
      return field === undefined ? [] : [[field.name, argumentFor(field)]]
    }),
    ...fields
      .filter((field) => !entry.args.includes(field.name))
      .map((field) => [field.name, flagFor(field)])
  ])
  return Command.make(name, config, (raw) =>
    Effect.gen(function* () {
      const flags = yield* root
      const server = yield* currentServer
      const input = yield* toolInput(
        entry.fields,
        raw,
        yield* scopeFor(entry.fields)
      )
      const result = yield* callTool(server, entry.name, input)
      yield* printResult(result, flags.json)
    })
  ).pipe(Command.withDescription(entry.description))
}
