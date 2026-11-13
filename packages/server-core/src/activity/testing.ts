import { ActivityActor, type ActivityCause } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type { SubscriptionIntent } from "../subscriptions/intents"
import type { TicketScopedChange } from "./changes"
import * as TicketActivity from "./TicketActivity"

export type RecordedActivity = Readonly<{
  document: TicketActivity.ActivityDocument
  actor: ActivityActor["Service"]
  cause: ActivityCause | null
  changes: ReadonlyArray<TicketScopedChange>
}>

export const passthroughTicketActivity = Layer.succeed(
  TicketActivity.TicketActivity,
  TicketActivity.TicketActivity.of({
    record: (_orgSlug, _slug, _document, _changes, _cause, write) => write,
    recover: () => Effect.void,
    release: () => Effect.void,
    removeTicket: () => Effect.void,
    page: () => Effect.succeed([])
  })
)

export const recordingTicketActivity = (
  recorded: Array<RecordedActivity>,
  subscriptions: Array<SubscriptionIntent> = []
) =>
  Layer.succeed(
    TicketActivity.TicketActivity,
    TicketActivity.TicketActivity.of({
      record: (
        _orgSlug,
        _slug,
        document,
        changes,
        cause,
        write,
        _events,
        effects = {}
      ) =>
        Effect.gen(function* () {
          const result = yield* write
          subscriptions.push(...(effects.subscriptions ?? []))
          if (changes.length > 0) {
            recorded.push({
              document,
              actor: yield* ActivityActor,
              cause,
              changes
            })
          }
          return result
        }),
      recover: () => Effect.void,
      release: () => Effect.void,
      removeTicket: () => Effect.void,
      page: () => Effect.succeed([])
    })
  )

export const asUser = (userId: string) =>
  Effect.provideService(ActivityActor, ActivityActor.user(userId))

export const testActivityLayer = (userId = "user-1") =>
  Layer.merge(
    passthroughTicketActivity,
    Layer.succeed(ActivityActor, ActivityActor.user(userId))
  )

export const recordingActivityLayer = (
  recorded: Array<RecordedActivity>,
  userId = "user-1"
) =>
  Layer.merge(
    recordingTicketActivity(recorded),
    Layer.succeed(ActivityActor, ActivityActor.user(userId))
  )

export const deferringTicketActivity = (
  recorded: Array<RecordedActivity>,
  subscriptions: Array<SubscriptionIntent> = []
) => {
  const held: Array<
    Readonly<{
      id: string
      entry: RecordedActivity
      intents: ReadonlyArray<SubscriptionIntent>
    }>
  > = []
  const keep = (
    entry: RecordedActivity,
    intents: ReadonlyArray<SubscriptionIntent>
  ) => {
    subscriptions.push(...intents)
    if (entry.changes.length > 0) recorded.push(entry)
  }
  return Layer.succeed(
    TicketActivity.TicketActivity,
    TicketActivity.TicketActivity.of({
      record: (
        _orgSlug,
        _slug,
        document,
        changes,
        cause,
        write,
        _events,
        effects = {}
      ) =>
        Effect.gen(function* () {
          const result = yield* write
          const entry = {
            document,
            actor: yield* ActivityActor,
            cause,
            changes
          }
          const intents = effects.subscriptions ?? []
          if (effects.settleLater === true)
            held.push({ id: document.id, entry, intents })
          else keep(entry, intents)
          return result
        }),
      recover: () => Effect.void,
      release: (_orgSlug, _slug, document, outcome) =>
        Effect.sync(() => {
          for (const batch of held.splice(0)) {
            if (batch.id !== document.id) held.push(batch)
            else if (outcome === "commit") keep(batch.entry, batch.intents)
          }
        }),
      removeTicket: () => Effect.void,
      page: () => Effect.succeed([])
    })
  )
}
