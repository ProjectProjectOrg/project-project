import { it } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Tracer from "effect/Tracer"
import { describe, expect } from "vitest"

import * as KeyedLock from "./KeyedLock"

describe("KeyedLock", () => {
  it.effect("runs work on the same key one at a time", () =>
    Effect.gen(function* () {
      const lock = yield* KeyedLock.KeyedLock
      const running = yield* Ref.make(0)
      const peak = yield* Ref.make(0)
      const work = Effect.gen(function* () {
        const now = yield* Ref.updateAndGet(running, (n) => n + 1)
        yield* Ref.update(peak, (p) => Math.max(p, now))
        yield* Effect.yieldNow
        yield* Ref.update(running, (n) => n - 1)
      })
      yield* Effect.all(
        Array.from({ length: 5 }, () => lock.withLock("a", work)),
        { concurrency: "unbounded" }
      )
      expect(yield* Ref.get(peak)).toBe(1)
    }).pipe(Effect.provide(KeyedLock.layer))
  )

  it.effect("lets different keys run at the same time", () =>
    Effect.gen(function* () {
      const lock = yield* KeyedLock.KeyedLock
      const release = yield* Deferred.make<void>()
      const holding = yield* lock
        .withLock("a", Deferred.await(release))
        .pipe(Effect.forkChild)
      const other = yield* lock.withLock("b", Effect.succeed("done"))
      expect(other).toBe("done")
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(holding)
    }).pipe(Effect.provide(KeyedLock.layer))
  )

  it.effect("releases the key when the work fails", () =>
    Effect.gen(function* () {
      const lock = yield* KeyedLock.KeyedLock
      yield* Effect.flip(lock.withLock("a", Effect.fail("boom")))
      expect(yield* lock.withLock("a", Effect.succeed(1))).toBe(1)
    }).pipe(Effect.provide(KeyedLock.layer))
  )

  it.effect("traces withLock under its own span", () => {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    return Effect.gen(function* () {
      const lock = yield* KeyedLock.KeyedLock
      yield* lock.withLock("a", Effect.void)
    }).pipe(
      Effect.withTracer(tracer),
      Effect.provide(KeyedLock.layer),
      Effect.map(() =>
        expect(
          spans
            .filter((span) => Option.isNone(span.parent))
            .map((span) => span.name)
        ).toEqual(["KeyedLock.withLock"])
      )
    )
  })
})
