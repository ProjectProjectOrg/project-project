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
        intents = []
      ) =>
        Effect.gen(function* () {
          const result = yield* write
          subscriptions.push(...intents)
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
