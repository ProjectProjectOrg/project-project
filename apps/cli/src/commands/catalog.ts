import { ToolCli, type ToolName, Tools } from "@pp/shared"
import type { Tool } from "effect/ai"
import { Argument, Command, Flag } from "effect/cli"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

import { callTool, callToolAs } from "../client/callTool"
import { usage } from "../CliFailure"
import { printResult } from "../output/format"
import { pagingEnabled } from "../output/pager"
import { stdoutTerminal } from "../output/terminal"
import { quotedCommandText } from "../output/terminalText"
import {
  allPages,
  currentServer,
  explainDefault,
  resolveScope
} from "./context"
import { type Field, fieldsOf, flagName } from "./fields"
import { toolInput } from "./input"
import { pagedList } from "./pagedList"
import { root } from "./root"
import { shapings } from "./shaping"

const SCOPE_FIELDS = new Set(["orgSlug", "projectSlug"])

const hints: Readonly<Record<Field["kind"], string>> = {
  string: "Text, or @file / @- to read it.",
  integer: "A whole number.",
  number: "A number.",
  boolean: "Pass --no-<flag> for false.",
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
      field.description === undefined
        ? undefined
        : quotedCommandText(field.description),
      field.choices === undefined ? hints[field.kind] : undefined,
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
          Argument.withDescription(quotedCommandText(field.description))
        )
  return field.required ? argument : Argument.optional(argument)
}

const flagFor = (field: Field) => {
  const name = flagName(field.name)
  if (field.choices !== undefined && field.kind === "string") {
    return Flag.optional(
      describe(Flag.Literals(name, field.choices), field, Flag.withDescription)
    )
  }
  if (field.choices !== undefined && field.kind === "strings") {
    return describe(
      Flag.Literals(name, field.choices),
      field,
      Flag.withDescription
    ).pipe(Flag.atLeast(field.required ? 1 : 0))
  }
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
        Flag.atLeast(field.required ? 1 : 0)
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

const UnknownPage = Schema.Struct({
  items: Schema.Array(Schema.Unknown),
  nextCursor: Schema.NullOr(Schema.String)
})

const allFlag = Flag.Boolean("all").pipe(
  Flag.withDescription("Follow every page and print all results."),
  Flag.withDefault(false)
)

const pagerFlag = Flag.Boolean("pager").pipe(
  Flag.withDescription(
    "In a terminal, page long lists through less. Pass --no-pager, or set PAGER=cat, to print one page as before."
  ),
  Flag.withDefault(true)
)

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
        description: quotedCommandText(tool.description ?? "")
      }
      return [entry]
    }
  })
}

export const catalogEntries: ReadonlyArray<CatalogEntry> = Object.values(
  Tools.tools
).flatMap(entryFor)

const flagPath = (message: string) =>
  message.replace(
    /\n\s+at \["(\w+)"\](.*)$/s,
    (_, field: string, rest: string) => ` for --${flagName(field)}${rest}`
  )

export const commandFor = (entry: CatalogEntry) => {
  const name = entry.command[entry.command.length - 1] ?? entry.name
  const decodeInput = Schema.decodeUnknownEffect(
    Tools.tools[entry.name].parametersSchema
  )
  const shaping = shapings[entry.name]
  const inputFields = entry.fields.filter(
    (field) => !shaping?.hides.includes(field.name)
  )
  const fields = inputFields.filter((field) => !SCOPE_FIELDS.has(field.name))
  const paginated = fields.some((field) => field.name === "cursor")
  const config = Object.fromEntries([
    ...(paginated
      ? [
          ["all", allFlag],
          ["pager", pagerFlag]
        ]
      : []),
    ...Object.entries(shaping?.flags ?? {}),
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
      const scope = yield* resolveScope(server, entry.fields)
      const input = {
        ...(yield* toolInput(inputFields, raw, {
          orgSlug: Option.map(scope.org, (org) => org.value),
          projectSlug: Option.map(scope.project, (project) => project.value)
        })),
        ...shaping?.build(raw)
      }
      yield* decodeInput(input).pipe(
        Effect.mapError((error) => usage(flagPath(error.message)))
      )
      const firstCursor = input["cursor"]
      const page = (cursor: string | undefined) =>
        callToolAs(
          server,
          entry.name,
          { limit: 200, ...input, cursor },
          UnknownPage
        )
      if (
        paginated &&
        !flags.json &&
        raw["all"] !== true &&
        raw["pager"] !== false &&
        firstCursor === undefined &&
        input["limit"] === undefined &&
        pagingEnabled(process.env) &&
        stdoutTerminal().fancy
      ) {
        return yield* pagedList(page, entry.command[0]).pipe(
          explainDefault(scope)
        )
      }
      const everyPage = Effect.map(
        allPages(
          page,
          Predicate.isString(firstCursor) ? firstCursor : undefined
        ),
        (items) => ({ items, nextCursor: null })
      )
      const result =
        raw["all"] === true
          ? yield* everyPage.pipe(explainDefault(scope))
          : yield* callTool(server, entry.name, input).pipe(
              explainDefault(scope)
            )
      yield* printResult(result, flags.json)
    })
  ).pipe(Command.withDescription(entry.description))
}
