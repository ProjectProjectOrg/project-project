import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Scope from "effect/Scope"

import { EverhourEvents } from "./Events"
import { EverhourIntegrations, SWEEP_EVERY } from "./Integrations"

export const EverhourRuntimeLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const events = yield* EverhourEvents
    const integrations = yield* EverhourIntegrations
    const scope = yield* Scope.Scope
    yield* events.enqueue().pipe(
      Effect.andThen(integrations.syncRequested()),
      Effect.catchCause(() =>
        Effect.logWarning(
          "Everhour sync dispatch failed; requested syncs will be retried"
        )
      ),
      Effect.repeat(Schedule.spaced("5 seconds")),
      Effect.forkIn(scope)
    )
    yield* integrations.requestStaleSyncs().pipe(
      Effect.catchCause(() => Effect.logWarning("Everhour sync sweep failed")),
      Effect.repeat(Schedule.spaced(SWEEP_EVERY)),
      Effect.forkIn(scope)
    )
  })
)
