import * as Effect from "effect/Effect"
import * as FiberSet from "effect/FiberSet"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as Scope from "effect/Scope"

import * as Dispatcher from "./Dispatcher"
import * as Events from "./Events"

const concurrency = 8

export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const dispatcher = yield* Dispatcher.WebhookDispatcher
    const events = yield* Events.WebhookEvents
    const scope = yield* Scope.Scope
    const inFlight = yield* FiberSet.make<void>()

    const dispatch = Effect.gen(function* () {
      const free = concurrency - (yield* FiberSet.size(inFlight))
      const claims = yield* dispatcher.claim(free)
      for (const claim of claims)
        yield* FiberSet.run(
          inFlight,
          dispatcher.process(claim).pipe(
            Effect.catchCause(() =>
              Effect.logWarning("Webhook delivery attempt failed", {
                endpointId: claim.endpointId
              })
            )
          )
        )
    })

    const loop = (
      name: string,
      effect: Effect.Effect<void>,
      every: Parameters<typeof Schedule.spaced>[0]
    ) =>
      effect.pipe(
        Effect.catchCause(() =>
          Effect.logWarning(`Webhook ${name} failed; it will be retried`)
        ),
        Effect.repeat(Schedule.spaced(every)),
        Effect.forkIn(scope)
      )

    yield* loop("event intake", events.enqueue(), "2 seconds")
    yield* loop("dispatch", dispatch, "1 second")
    yield* loop("expiry", dispatcher.expire(), "1 minute")
  })
)
