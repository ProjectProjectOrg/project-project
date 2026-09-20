import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { User } from "@projectproject/shared"

export const McpRequestUser = Context.Reference<Option.Option<User>>(
  "@projectproject/backend/mcp/McpRequestUser",
  { defaultValue: () => Option.none() }
)

export const McpCurrentUser: Effect.Effect<User> = Effect.flatMap(
  McpRequestUser,
  Option.match({
    onNone: () =>
      Effect.die("MCP tool handler ran without McpAuthMiddlewareLive"),
    onSome: Effect.succeed
  })
)
