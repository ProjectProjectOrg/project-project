import * as Effect from "effect/Effect"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"
import { Tool, Toolkit } from "effect/unstable/ai"
import { McpTools, type McpToolName } from "@projectproject/shared"
import { mapToolError } from "./errorMap"

type SpecOf<K extends McpToolName> = (typeof McpTools)[K]
type InputOf<K extends McpToolName> = Schema.Schema.Type<SpecOf<K>["input"]>
type OutputOf<K extends McpToolName> = Schema.Schema.Type<SpecOf<K>["output"]>

export type McpHandlers<R> = {
  readonly [K in McpToolName]: (
    input: InputOf<K>
  ) => Effect.Effect<OutputOf<K>, unknown, R>
}

type McpToolFor<K extends McpToolName> = K extends McpToolName
  ? Tool.Tool<
      K,
      {
        readonly parameters: SpecOf<K>["input"]
        readonly success: SpecOf<K>["output"]
        readonly failure: typeof Schema.String
        readonly failureMode: "return"
      }
    >
  : never

export type McpToolsByName = { readonly [K in McpToolName]: McpToolFor<K> }

const objectType = Schema.makeFilter(() => true, {
  toJsonSchema: () => ({ type: "object" })
})

const withObjectJsonSchema = <S extends Schema.Top>(schema: S): S =>
  Schema.toJsonSchemaDocument(schema).schema.type === "object"
    ? schema
    : (schema.check(objectType) as S)

const makeTool = <K extends McpToolName>(name: K): McpToolFor<K> => {
  const spec = McpTools[name]
  return Tool.make(name, {
    description: spec.description,
    parameters: withObjectJsonSchema(spec.input),
    success: spec.output,
    failure: Schema.String,
    failureMode: "return"
  }) as McpToolFor<K>
}

const toolNames = Record.keys(McpTools)

export const McpToolkit = Toolkit.make(
  ...toolNames.map((name) => makeTool(name))
) as Toolkit.Toolkit<McpToolsByName>

const failureText = (e: unknown) => mapToolError(e).content[0].text

export const toolFailure = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, string, R> =>
  effect.pipe(
    Effect.tapDefect((defect) => Effect.logError("mcp tool defect", defect)),
    Effect.mapError(failureText),
    Effect.catchDefect((defect) => Effect.fail(failureText(defect)))
  )

type HandlerFailure = { readonly _tag: string }

type AnyHandler<R> = (
  input: unknown
) => Effect.Effect<unknown, HandlerFailure, R>

export const toToolkitHandlers = <R>(
  handlers: McpHandlers<R>
): Toolkit.HandlersFrom<McpToolsByName> =>
  Record.map(
    handlers,
    (handler, name) => (input: unknown) =>
      toolFailure((handler as AnyHandler<R>)(input)).pipe(
        Effect.withSpan(`mcp.tool.${name}`)
      )
  ) as unknown as Toolkit.HandlersFrom<McpToolsByName>
