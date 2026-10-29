import { ActivityActor, CurrentUser, type User } from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

export type ToolClient = Readonly<{ id: string; name: string }>

export type ToolCallerShape = Readonly<{
  user: User
  client: Option.Option<ToolClient>
}>

export const ToolCaller = Context.Reference<Option.Option<ToolCallerShape>>(
  "@pp/backend/tools/ToolCaller",
  { defaultValue: () => Option.none() }
)

const actorOf = (caller: ToolCallerShape) =>
  Option.match(caller.client, {
    onNone: () => ActivityActor.user(caller.user.id),
    onSome: (client) => ActivityActor.agent(caller.user.id, client)
  })

export const withToolCaller = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, E, Exclude<Exclude<R, CurrentUser>, ActivityActor>> =>
  Effect.flatMap(
    ToolCaller,
    Option.match({
      onNone: () => Effect.die("A tool ran without an authenticated caller"),
      onSome: (caller) =>
        effect.pipe(
          Effect.provideService(CurrentUser, caller.user),
          Effect.provideService(ActivityActor, actorOf(caller))
        )
    })
  )
