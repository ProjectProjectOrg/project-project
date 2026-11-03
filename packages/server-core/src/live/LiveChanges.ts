import type {
  CommentsChanged,
  GroupChanged,
  LiveChange,
  LiveCursor,
  TicketChanged,
  TicketsChanged
} from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Random from "effect/Random"
import * as Semaphore from "effect/Semaphore"
import * as Stream from "effect/Stream"

export const ChangeOrigin = Context.Reference<string | null>(
  "@pp/server-core/live/ChangeOrigin",
  { defaultValue: () => null }
)

export const forkDetached = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.forkDetach(Effect.provideService(effect, ChangeOrigin, null))

type Unsequenced<Change> = Omit<Change, "origin" | "cursor">

export type LiveChangeInput =
  | Unsequenced<TicketChanged>
  | Unsequenced<TicketsChanged>
  | Unsequenced<CommentsChanged>
  | Unsequenced<GroupChanged>

export type PublishedChange = LiveChange extends infer Change
  ? Change extends LiveChange
    ? Omit<Change, "cursor">
    : never
  : never

export type LiveSignal =
  | Readonly<{ kind: "position"; seq: number }>
  | Readonly<{ kind: "resync"; seq: number }>
  | Readonly<{ kind: "change"; seq: number; change: PublishedChange }>

export class LiveChanges extends Context.Service<
  LiveChanges,
  Readonly<{
    publish: (change: LiveChangeInput) => Effect.Effect<void>
    changes: Stream.Stream<PublishedChange>
    changesAfter: (after: LiveCursor | undefined) => Stream.Stream<LiveSignal>
    cursorAt: (seq: number) => LiveCursor
  }>
>()("@pp/server-core/live/LiveChanges") {}

const SUBSCRIBER_CAPACITY = 4096
const REPLAY_CAPACITY = 16_384

type Sequenced = Readonly<{ seq: number; change: PublishedChange }>

const parseCursor = (cursor: LiveCursor) => {
  const dot = cursor.lastIndexOf(".")
  const seq = Number(cursor.slice(dot + 1))
  return dot > 0 && Number.isSafeInteger(seq) && seq >= 0
    ? { epoch: cursor.slice(0, dot), seq }
    : null
}

const asChange = ({ seq, change }: Sequenced): LiveSignal => ({
  kind: "change",
  seq,
  change
})

const make = Effect.gen(function* () {
  const epoch = [
    yield* Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER),
    yield* Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER)
  ]
    .map((part) => part.toString(36))
    .join("")
  const pubsub = yield* Effect.acquireRelease(
    PubSub.sliding<Sequenced>(SUBSCRIBER_CAPACITY),
    PubSub.shutdown
  )
  const inOrder = yield* Semaphore.make(1)
  const replay: Array<Sequenced> = []
  let head = 0

  const publish = Effect.fn("LiveChanges.publish")(function* (
    change: LiveChangeInput
  ) {
    const origin = yield* ChangeOrigin
    yield* inOrder.withPermit(
      Effect.suspend(() => {
        head += 1
        const sequenced: Sequenced = {
          seq: head,
          change: { ...change, origin } as PublishedChange
        }
        replay.push(sequenced)
        if (replay.length > REPLAY_CAPACITY) replay.shift()
        return PubSub.publish(pubsub, sequenced)
      })
    )
  })

  const between = (after: number, before: number) => {
    const missing = replay.filter(
      (entry) => entry.seq > after && entry.seq < before
    )
    return missing.length === before - after - 1 ? missing : null
  }

  const catchUp = (
    after: LiveCursor | undefined,
    current: number
  ): ReadonlyArray<LiveSignal> => {
    if (after === undefined) return [{ kind: "position", seq: current }]
    const parsed = parseCursor(after)
    if (parsed === null || parsed.epoch !== epoch || parsed.seq > current)
      return [{ kind: "resync", seq: current }]
    const missed = between(parsed.seq, current + 1)
    return missed === null
      ? [{ kind: "resync", seq: current }]
      : [{ kind: "position", seq: parsed.seq }, ...missed.map(asChange)]
  }

  const fillGaps = (
    last: number,
    entry: Sequenced
  ): readonly [number, ReadonlyArray<LiveSignal>] => {
    if (entry.seq <= last) return [last, []]
    if (entry.seq === last + 1) return [entry.seq, [asChange(entry)]]
    const missed = between(last, entry.seq)
    return [
      entry.seq,
      missed === null
        ? [{ kind: "resync", seq: entry.seq - 1 }, asChange(entry)]
        : [...missed.map(asChange), asChange(entry)]
    ]
  }

  const changesAfter = (after: LiveCursor | undefined) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const subscription = yield* PubSub.subscribe(pubsub)
        const current = yield* inOrder.withPermit(Effect.sync(() => head))
        return Stream.concat(
          Stream.fromIterable(catchUp(after, current)),
          Stream.fromSubscription(subscription).pipe(
            Stream.mapAccum(() => current, fillGaps)
          )
        )
      })
    )

  return LiveChanges.of({
    publish,
    changes: Stream.fromPubSub(pubsub).pipe(Stream.map(({ change }) => change)),
    changesAfter,
    cursorAt: (seq) => `${epoch}.${seq}`
  })
})

export const layer = Layer.effect(LiveChanges, make)
