import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { Unauthorized, type User } from "@projectproject/shared"

export const McpRequestUser = Context.Reference<Option.Option<User>>(
  "@projectproject/backend/mcp/McpRequestUser",
  { defaultValue: () => Option.none() }
)

export const McpCurrentUser: Effect.Effect<User, Unauthorized> = Effect.flatMap(
  McpRequestUser,
  Option.match({
    onNone: () => Effect.fail(new Unauthorized()),
    onSome: Effect.succeed
  })
)
