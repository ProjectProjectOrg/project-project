import { ToolFailure, type ToolName, Tools } from "@pp/shared"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

const encodeFailure = Schema.encodeEffect(ToolFailure)

export class ToolInputInvalid extends Data.TaggedError("ToolInputInvalid")<
  Readonly<{ message: string }>
> {}

export type ToolkitHandlers = Effect.Success<typeof Tools>

export const isToolName = (name: string): name is ToolName =>
  Object.hasOwn(Tools.tools, name)

export const invokeTool = (
  toolkit: ToolkitHandlers,
  name: ToolName,
  body: unknown
) =>
  Effect.gen(function* () {
    const params = yield* Schema.decodeUnknownEffect(
      Schema.toEncoded(Tools.tools[name].parametersSchema)
    )(body)
    const result = yield* toolkit
      .handle(name, params)
      .pipe(Stream.unwrap, Stream.runLast, Effect.flatMap(Effect.fromOption))
    return { isFailure: result.isFailure, encoded: result.encodedResult }
  }).pipe(
    Effect.catchTag("ToolFailure", (failure) =>
      Effect.map(encodeFailure(failure), (encoded) => ({
        isFailure: true,
        encoded
      }))
    ),
    Effect.catchTags({
      SchemaError: (error) =>
        Effect.fail(new ToolInputInvalid({ message: error.message })),
      AiError: (error) =>
        Predicate.isTagged(error.reason, "ToolParameterValidationError")
          ? Effect.fail(new ToolInputInvalid({ message: error.reason.message }))
          : Effect.die(error),
      NoSuchElementError: Effect.die
    }),
    Effect.withSpan(`tool.invoke.${name}`)
  )
