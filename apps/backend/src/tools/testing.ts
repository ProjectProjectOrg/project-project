import { ToolFailure, type ToolName, Tools, type User } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { ToolHandlersLive } from "./handlers"
import { invokeTool } from "./invokeTool"
import { ToolCaller } from "./ToolCaller"

const decodeFailure = Schema.decodeUnknownEffect(ToolFailure)

export const callTool = <A, I>(
  name: ToolName,
  input: Readonly<Record<string, unknown>>,
  caller: User,
  success: Schema.Codec<A, I>
) =>
  Effect.flatMap(Tools, (toolkit) => invokeTool(toolkit, name, input)).pipe(
    Effect.flatMap((result) =>
      result.isFailure
        ? Effect.flatMap(decodeFailure(result.encoded), Effect.fail)
        : Schema.decodeUnknownEffect(success)(result.encoded)
    ),
    Effect.catchTag("SchemaError", Effect.die),
    Effect.provide(ToolHandlersLive),
    Effect.provideService(
      ToolCaller,
      Option.some({ user: caller, client: Option.none() })
    )
  )
