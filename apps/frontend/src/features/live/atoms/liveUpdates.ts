import type { LiveCursor, LiveEvent } from "@pp/shared"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Atom from "effect/reactivity/Atom"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"

import { Api } from "@/api/Api"
import { clientId } from "@/api/clientId"
import { Keys, type ReactivityKey } from "@/api/keys"
import { liveFresh } from "@/api/liveFreshness"
import { openInteractions } from "@/lib/interactions"

import {
  initialLiveGate,
  type LiveGateInput,
  stepLiveGate
} from "../lib/liveGate"
import { liveEventKeys, uniqueKeys } from "../lib/liveKeys"

const BATCH_WINDOW = "150 millis"
const BATCH_LIMIT = 256
const SILENCE_LIMIT = "15 seconds"

const reconnect = Schedule.min([
  Schedule.exponential("1 second"),
  Schedule.spaced("30 seconds")
]).pipe(Schedule.jittered)

class LiveStreamClosed extends Data.TaggedError("LiveStreamClosed") {}

const liveAttempted = Atom.make(false).pipe(Atom.keepAlive)
const liveCursor = Atom.make<LiveCursor | null>(null).pipe(Atom.keepAlive)

type Received = Readonly<{
  keys: ReadonlyArray<ReactivityKey>
  cursor: LiveCursor
}>

const received =
  (resyncFirst: boolean) =>
  (event: LiveEvent, index: number): Received => ({
    keys:
      resyncFirst && index === 0
        ? [Keys.liveResync()]
        : liveEventKeys(clientId)(event),
    cursor: event.cursor
  })

const merged = (batch: ReadonlyArray<Received>): Received => ({
  keys: uniqueKeys(batch.map((entry) => entry.keys)),
  cursor: batch.at(-1)?.cursor ?? ""
})

const session = (
  after: LiveCursor | null,
  resyncFirst: boolean,
  remember: (cursor: LiveCursor) => void
) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const events = yield* Api.use((client) =>
        client.live.events({ query: after === null ? {} : { after } })
      )
      return events.pipe(
        Stream.timeout(SILENCE_LIMIT),
        Stream.concat(Stream.fail(new LiveStreamClosed())),
        Stream.zipWithIndex,
        Stream.map(([event, index]) => received(resyncFirst)(event, index)),
        Stream.groupedWithin(BATCH_LIMIT, BATCH_WINDOW),
        Stream.map(merged),
        Stream.tap(({ cursor }) => Effect.sync(() => remember(cursor))),
        Stream.map(({ keys }) => keys),
        Stream.filter((keys) => keys.length > 0)
      )
    })
  )

export const liveUpdates = Api.runtime.atom((get) => {
  const attempt = Stream.unwrap(
    Effect.sync(() => {
      const after = get.once(liveCursor)
      const resyncFirst = after === null && get.once(liveAttempted)
      get.set(liveAttempted, true)
      return session(after, resyncFirst, (cursor) => {
        get.set(liveCursor, cursor)
        get.set(liveFresh, true)
      })
    })
  ).pipe(Stream.tapError(() => Effect.sync(() => get.set(liveFresh, false))))
  return Stream.merge(
    attempt.pipe(
      Stream.retry(reconnect),
      Stream.map((keys): LiveGateInput => ({ kind: "keys", keys }))
    ),
    get
      .stream(openInteractions)
      .pipe(
        Stream.map((open): LiveGateInput => ({ kind: "interactions", open }))
      )
  ).pipe(
    Stream.mapAccum(() => initialLiveGate, stepLiveGate),
    Stream.runForEach((keys) => Reactivity.invalidate(keys))
  )
})
