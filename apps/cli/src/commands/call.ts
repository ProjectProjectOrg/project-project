import { Argument, Command } from "effect/cli"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

import { callTool } from "../client/callTool"
import { usage } from "../CliFailure"
import { printResult } from "../output/format"
import { catalogEntries } from "./catalog"
import { currentScope, currentServer } from "./context"
import { readText } from "./input"
import { root } from "./root"

const decodeObject = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))
)

const firstSentence = (text: string) => text.split(/(?<=\.)\s/)[0] ?? text

export const toolsCommand = Command.make("tools", {}, () =>
  Effect.gen(function* () {
    const flags = yield* root
    yield* printResult(
      catalogEntries.map((entry) => ({
        name: entry.name,
        command: `pp ${entry.command.join(" ")}`,
        description: firstSentence(entry.description)
      })),
      flags.json
    )
  })
).pipe(
  Command.withDescription(
    "List every tool, with its pp command. The same tools agents use over MCP."
  )
)

export const callCommand = Command.make(
  "call",
  {
    tool: Argument.Literals(
      "tool",
      catalogEntries.map((entry) => entry.name)
    ).pipe(Argument.withDescription("Tool name, as listed by `pp tools`.")),
    input: Argument.String("input").pipe(
      Argument.withDescription(
        "JSON input: inline, @file, or - for standard input. Defaults to {}."
      ),
      Argument.optional
    )
  },
  ({ tool, input }) =>
    Effect.gen(function* () {
      const flags = yield* root
      const server = yield* currentServer
      const text = yield* Option.match(input, {
        onNone: () => Effect.succeed("{}"),
        onSome: (value) =>
          value === "-" || value.startsWith("@")
            ? readText(value === "-" ? "-" : value.slice(1))
            : Effect.succeed(value)
      })
      const given = yield* decodeObject(text).pipe(
        Effect.mapError(() => usage("The input must be a JSON object."))
      )
      const scope = yield* currentScope
      const entry = catalogEntries.find((candidate) => candidate.name === tool)
      const wants = (name: string) =>
        entry?.fields.some((field) => field.name === name) === true
      const withScope: Record<string, unknown> = {}
      if (wants("orgSlug") && Option.isSome(scope.org)) {
        withScope["orgSlug"] = scope.org.value
      }
      if (wants("projectSlug") && Option.isSome(scope.project)) {
        withScope["projectSlug"] = scope.project.value
      }
      Object.assign(withScope, given)
      const result = yield* callTool(server, tool, withScope)
      yield* printResult(result, flags.json || !Predicate.isObject(result))
    })
).pipe(
  Command.withDescription(
    "Call any tool with raw JSON input. Org and project are filled in from --org and --project when missing."
  ),
  Command.withExamples([
    {
      command: `pp call get_ticket '{"id":"T-12"}'`,
      description: "Fetch a ticket"
    },
    {
      command: "pp call update_ticket @changes.json",
      description: "Send input from a file"
    }
  ])
)
