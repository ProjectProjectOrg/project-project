import {
  ActivityActor,
  type ActivityActorShape,
  type ActivityCause
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type { TicketScopedChange } from "./changes"
import { TicketActivity, type ActivityDocument } from "./TicketActivity"

export type RecordedActivity = Readonly<{
  document: ActivityDocument
  actor: ActivityActorShape
  cause: ActivityCause | null
  changes: ReadonlyArray<TicketScopedChange>
}>

export const passthroughTicketActivity = Layer.succeed(
  TicketActivity,
  TicketActivity.of({
    record: (_orgSlug, _slug, _document, _changes, _cause, write) => write,
    recover: () => Effect.void,
    removeTicket: () => Effect.void,
    page: () => Effect.succeed([])
  })
)

export const recordingTicketActivity = (recorded: Array<RecordedActivity>) =>
  Layer.succeed(
    TicketActivity,
    TicketActivity.of({
      record: (_orgSlug, _slug, document, changes, cause, write) =>
        Effect.gen(function* () {
          const result = yield* write
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
