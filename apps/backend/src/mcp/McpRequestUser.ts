import { ActivityActor, type ActivityActorShape, type User } from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

export type McpClient = Readonly<{ id: string; name: string }>

export const McpRequestUser = Context.Reference<Option.Option<User>>(
  "@pp/backend/mcp/McpRequestUser",
  { defaultValue: () => Option.none() }
)

export const McpRequestClient = Context.Reference<Option.Option<McpClient>>(
  "@pp/backend/mcp/McpRequestClient",
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

export const McpActivityActor: Effect.Effect<ActivityActorShape> = Effect.gen(
  function* () {
    const user = yield* McpCurrentUser
    const client = yield* McpRequestClient
    return Option.match(client, {
      onNone: () => ActivityActor.user(user.id),
      onSome: (found) => ActivityActor.agent(user.id, found)
    })
  }
)
