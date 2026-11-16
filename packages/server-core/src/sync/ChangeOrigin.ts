import * as Context from "effect/Context"
import * as Effect from "effect/Effect"

export const ChangeOrigin = Context.Reference<string | null>(
  "@pp/server-core/sync/ChangeOrigin",
  { defaultValue: () => null }
)

export const forkDetached = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.forkDetach(Effect.provideService(effect, ChangeOrigin, null))
