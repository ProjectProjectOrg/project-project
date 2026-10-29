import type { ToolFailure } from "@pp/shared"
import * as Effect from "effect/Effect"

import { forUser, inOrg, inProject } from "./access"
import { toolFailureOf } from "./errorText"
import { withToolCaller } from "./ToolCaller"
import type { ToolServices } from "./ToolHandlers"

export const asToolFailure = <A, E, R>(
  effect: Effect.Effect<A, E, R>
): Effect.Effect<A, ToolFailure, R> =>
  Effect.catch(effect, (error) => {
    const failure = toolFailureOf(error)
    return failure === undefined ? Effect.die(error) : Effect.fail(failure)
  })

export const toolRunner = Effect.gen(function* () {
  const services = yield* Effect.context<ToolServices>()
  const finish =
    (name: string) =>
    <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        asToolFailure,
        withToolCaller,
        Effect.provideContext(services),
        Effect.withSpan(`tool.${name}`)
      )
  return {
    user: <I, A, E, R>(
      name: Parameters<typeof forUser>[0],
      handler: (input: I) => Effect.Effect<A, E, R>
    ) => {
      const scoped = forUser(name, handler)
      return (input: I) => finish(name)(scoped(input))
    },
    org: <I extends Readonly<{ orgSlug: string }>, A, E, R>(
      name: Parameters<typeof inOrg>[0],
      handler: (input: I) => Effect.Effect<A, E, R>
    ) => {
      const scoped = inOrg(name, handler)
      return (input: I) => finish(name)(scoped(input))
    },
    project: <
      I extends Readonly<{ orgSlug: string; projectSlug: string }>,
      A,
      E,
      R
    >(
      name: Parameters<typeof inProject>[0],
      handler: (input: I) => Effect.Effect<A, E, R>
    ) => {
      const scoped = inProject(name, handler)
      return (input: I) => finish(name)(scoped(input))
    }
  }
})
