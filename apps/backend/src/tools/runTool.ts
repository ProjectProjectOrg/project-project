import type {
  OrgRequirement,
  ProjectRequirement,
  ToolFailure
} from "@pp/shared"
import * as Effect from "effect/Effect"

import { inOrg, inProject } from "./access"
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
  const finish = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(asToolFailure, withToolCaller, Effect.provideContext(services))
  return {
    user:
      <I, A, E, R>(handler: (input: I) => Effect.Effect<A, E, R>) =>
      (input: I) =>
        finish(handler(input)),
    org: <I extends Readonly<{ orgSlug: string }>, A, E, R>(
      requires: OrgRequirement,
      handler: (input: I) => Effect.Effect<A, E, R>
    ) => {
      const scoped = inOrg(requires, handler)
      return (input: I) => finish(scoped(input))
    },
    project: <
      I extends Readonly<{ orgSlug: string; projectSlug: string }>,
      A,
      E,
      R
    >(
      requires: ProjectRequirement,
      handler: (input: I) => Effect.Effect<A, E, R>
    ) => {
      const scoped = inProject(requires, handler)
      return (input: I) => finish(scoped(input))
    }
  }
})
