import {
  CurrentUser,
  type LiveCursor,
  type LiveEvent,
  permits
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"

import * as Access from "../access/Access"
import * as LiveChanges from "./LiveChanges"

export class LiveFeed extends Context.Service<
  LiveFeed,
  Readonly<{
    forCurrentUser: (
      after: LiveCursor | undefined
    ) => Effect.Effect<Stream.Stream<LiveEvent>, never, CurrentUser>
  }>
>()("@pp/server-core/live/LiveFeed") {}

const HEARTBEAT_INTERVAL = "5 seconds"

type FeedItem =
  | Readonly<{ kind: "tick" }>
  | Readonly<{ kind: "seen"; seq: number; event: LiveEvent | null }>

const tick: FeedItem = { kind: "tick" }

const make = Effect.gen(function* () {
  const liveChanges = yield* LiveChanges.LiveChanges
  const access = yield* Access.Access

  const forCurrentUser = (after: LiveCursor | undefined) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser

      const canRead = (change: LiveChanges.PublishedChange) =>
        access.project(change.orgSlug, change.slug).pipe(
          Effect.map((scope) =>
            permits(scope.permissions, { ticket: ["read"] })
          ),
          Effect.catchTag("NotFound", () => Effect.succeed(false)),
          Effect.provideService(CurrentUser, user)
        )

      const toItem = (
        signal: LiveChanges.LiveSignal
      ): Effect.Effect<FeedItem> => {
        const cursor = liveChanges.cursorAt(signal.seq)
        if (signal.kind === "position")
          return Effect.succeed({
            kind: "seen",
            seq: signal.seq,
            event: { kind: "heartbeat", cursor }
          })
        if (signal.kind === "resync")
          return Effect.succeed({
            kind: "seen",
            seq: signal.seq,
            event: { kind: "resync", cursor }
          })
        return Effect.map(
          canRead(signal.change),
          (readable): FeedItem => ({
            kind: "seen",
            seq: signal.seq,
            event: readable ? ({ ...signal.change, cursor } as LiveEvent) : null
          })
        )
      }

      const stampHeartbeats = (
        seen: number | null,
        item: FeedItem
      ): readonly [number | null, ReadonlyArray<LiveEvent>] => {
        if (item.kind === "seen")
          return [item.seq, item.event === null ? [] : [item.event]]
        return seen === null
          ? [seen, []]
          : [seen, [{ kind: "heartbeat", cursor: liveChanges.cursorAt(seen) }]]
      }

      return Stream.merge(
        liveChanges.changesAfter(after).pipe(Stream.mapEffect(toItem)),
        Stream.tick(HEARTBEAT_INTERVAL).pipe(
          Stream.drop(1),
          Stream.map(() => tick)
        )
      ).pipe(Stream.mapAccum((): number | null => null, stampHeartbeats))
    })

  return LiveFeed.of({ forCurrentUser })
})

export const layer = Layer.effect(LiveFeed, make)
