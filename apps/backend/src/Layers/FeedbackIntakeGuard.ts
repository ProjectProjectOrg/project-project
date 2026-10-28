import { FeedbackConfig } from "@pp/server-core/feedback/FeedbackConfig"
import { clientIp } from "@pp/server-core/feedback/feedbackTicket"
import { FeedbackIntakeGuard, NotFound, RateLimited } from "@pp/shared"
import * as Clock from "effect/Clock"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import { HttpServerRequest } from "effect/http"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { RateLimiter } from "effect/persistence"
import * as Predicate from "effect/Predicate"

const INTAKE_LIMIT = 30
const INTAKE_WINDOW = Duration.hours(1)

const quotaExceeded = Effect.fn("FeedbackIntakeGuard.quotaExceeded")(function* (
  retryAfter: Duration.Duration
) {
  const now = yield* Clock.currentTimeMillis
  return yield* new RateLimited({
    resetAt: Math.ceil((now + Duration.toMillis(retryAfter)) / 1000)
  })
})

const IntakeRateLimiterLive =
  // @effect-diagnostics-next-line unstableApiUsage:off
  RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory))

export const FeedbackIntakeGuardLive = Layer.effect(
  FeedbackIntakeGuard,
  Effect.gen(function* () {
    const config = yield* FeedbackConfig
    // @effect-diagnostics-next-line unstableApiUsage:off
    const limiter = yield* RateLimiter.RateLimiter
    return FeedbackIntakeGuard.of(
      Effect.fn("FeedbackIntakeGuard")(function* (httpEffect) {
        if (Option.isNone(config.intake)) return yield* new NotFound()
        const request = yield* HttpServerRequest.HttpServerRequest
        const ip = clientIp(
          request.headers["x-forwarded-for"],
          Option.getOrUndefined(request.remoteAddress),
          config.trustedProxyHops
        )
        yield* limiter
          .consume({
            key: `feedback-intake:${ip ?? "unknown"}`,
            limit: INTAKE_LIMIT,
            window: INTAKE_WINDOW,
            algorithm: "fixed-window",
            onExceeded: "fail"
          })
          .pipe(
            Effect.catchTag("RateLimiterError", ({ reason }) =>
              Predicate.isTagged(reason, "RateLimitExceeded")
                ? quotaExceeded(reason.retryAfter)
                : Effect.die(reason)
            )
          )
        return yield* httpEffect
      })
    )
  })
).pipe(Layer.provide(IntakeRateLimiterLive))
