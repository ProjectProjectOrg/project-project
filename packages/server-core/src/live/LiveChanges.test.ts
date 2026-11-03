import { it } from "@effect/vitest"
import { TicketId } from "@pp/shared"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { describe, expect } from "vitest"

import * as LiveChanges from "./LiveChanges"

const ticket = (id: string): LiveChanges.LiveChangeInput => ({
  kind: "ticket",
  orgSlug: "acme",
  slug: "web",
  id: TicketId.make(id)
})

const tickets = (count: number) =>
  Array.from({ length: count }, (_, n) => ticket(`T-${n + 1}`))

const publishAll = (
  live: LiveChanges.LiveChanges["Service"],
  changes: ReadonlyArray<LiveChanges.LiveChangeInput>
) => Effect.forEach(changes, live.publish, { discard: true })

const currentCursor = (live: LiveChanges.LiveChanges["Service"]) =>
  live.changesAfter(undefined).pipe(
    Stream.runHead,
    Effect.map((signal) => live.cursorAt(Option.getOrThrow(signal).seq))
  )

const labels = (signals: Iterable<LiveChanges.LiveSignal>) =>
  [...signals].map((signal) =>
    signal.kind === "change" && signal.change.kind === "ticket"
      ? signal.change.id
      : signal.kind
  )

it.effect(
  "work forked off a request publishes without the request's origin",
  () =>
    Effect.gen(function* () {
      const live = yield* LiveChanges.LiveChanges
      const received = yield* live.changes.pipe(
        Stream.take(2),
        Stream.runCollect,
        Effect.forkScoped({ startImmediately: true })
      )

      yield* Effect.gen(function* () {
        yield* live.publish(ticket("T-1"))
        yield* Fiber.join(
          yield* LiveChanges.forkDetached(live.publish(ticket("T-2")))
        )
      }).pipe(Effect.provideService(LiveChanges.ChangeOrigin, "tab-1"))

      expect(yield* Fiber.join(received)).toEqual([
        { ...ticket("T-1"), origin: "tab-1" },
        { ...ticket("T-2"), origin: null }
      ])
    }).pipe(Effect.provide(LiveChanges.layer))
)

describe("reconnecting with a cursor", () => {
  it.effect("replays exactly the changes published since that cursor", () =>
    Effect.gen(function* () {
      const live = yield* LiveChanges.LiveChanges
      yield* publishAll(live, tickets(2))
      const cursor = yield* currentCursor(live)
      yield* publishAll(live, [ticket("T-8"), ticket("T-9")])

      const replayed = yield* live
        .changesAfter(cursor)
        .pipe(Stream.take(3), Stream.runCollect)

      expect(labels(replayed)).toEqual(["position", "T-8", "T-9"])
    }).pipe(Effect.provide(LiveChanges.layer))
  )

  it.effect.each([
    { name: "a cursor from before a server restart", cursor: "earlier.2" },
    { name: "a malformed cursor", cursor: "garbage" }
  ])("asks the client to resync for $name", ({ cursor }) =>
    Effect.gen(function* () {
      const live = yield* LiveChanges.LiveChanges
      yield* publishAll(live, tickets(2))

      const first = yield* live
        .changesAfter(cursor)
        .pipe(Stream.take(1), Stream.runCollect)

      expect(labels(first)).toEqual(["resync"])
    }).pipe(Effect.provide(LiveChanges.layer))
  )

  it.effect(
    "asks the client to resync once the cursor is older than the replay buffer",
    () =>
      Effect.gen(function* () {
        const live = yield* LiveChanges.LiveChanges
        const cursor = yield* currentCursor(live)
        yield* publishAll(live, tickets(17_000))

        const first = yield* live
          .changesAfter(cursor)
          .pipe(Stream.take(1), Stream.runCollect)

        expect(labels(first)).toEqual(["resync"])
      }).pipe(Effect.provide(LiveChanges.layer))
  )
})

describe("a subscriber that falls behind", () => {
  const lagBehind = (published: number) =>
    Effect.gen(function* () {
      const live = yield* LiveChanges.LiveChanges
      const caughtUp = yield* Deferred.make<void>()
      const received = yield* live.changesAfter(undefined).pipe(
        Stream.tap(() => Deferred.await(caughtUp)),
        Stream.takeUntil(
          (signal) =>
            signal.kind === "resync" ||
            (signal.kind === "change" && signal.seq === published)
        ),
        Stream.runCollect,
        Effect.forkScoped({ startImmediately: true })
      )
      yield* publishAll(live, tickets(published))
      yield* Deferred.succeed(caughtUp, undefined)
      return [...(yield* Fiber.join(received))]
    }).pipe(Effect.provide(LiveChanges.layer))

  it.effect("catches up from the replay buffer without a resync", () =>
    Effect.gen(function* () {
      const received = yield* lagBehind(10_000)
      expect(received.some((signal) => signal.kind === "resync")).toBe(false)
      expect(
        received
          .filter((signal) => signal.kind === "change")
          .map((signal) => signal.seq)
      ).toEqual(Array.from({ length: 10_000 }, (_, n) => n + 1))
    })
  )

  it.effect(
    "is told to resync when it falls further behind than the replay buffer",
    () =>
      Effect.gen(function* () {
        const received = yield* lagBehind(25_000)
        expect(received.at(-1)?.kind).toBe("resync")
      })
  )
})
