import { Db } from "@pp/db"
import {
  projectIntegrationEvent,
  projectIntegrationLink,
  slackNotification
} from "@pp/db/schema"
import { and, eq, inArray, isNull } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export class SlackEvents extends Context.Service<
  SlackEvents,
  Readonly<{ enqueue: () => Effect.Effect<void> }>
>()("@pp/integration-slack/Events/SlackEvents") {
  static readonly layer = Layer.effect(
    SlackEvents,
    Effect.gen(function* () {
      const db = yield* Db
      const enqueue = Effect.fn("Slack.enqueueEvents")(function* () {
        const pending = yield* db
          .select({
            id: projectIntegrationEvent.id,
            linkId: projectIntegrationEvent.projectIntegrationLinkId,
            payload: projectIntegrationEvent.payload,
            actorId: projectIntegrationEvent.actorId
          })
          .from(projectIntegrationEvent)
          .innerJoin(
            projectIntegrationLink,
            eq(
              projectIntegrationLink.id,
              projectIntegrationEvent.projectIntegrationLinkId
            )
          )
          .where(
            and(
              eq(projectIntegrationLink.provider, "slack"),
              isNull(projectIntegrationEvent.consumedAt)
            )
          )
          .orderBy(projectIntegrationEvent.createdAt)
          .limit(100)
          .pipe(Effect.orDie)
        if (pending.length === 0) return
        const now = yield* DateTime.nowAsDate
        yield* db
          .transaction(() =>
            Effect.gen(function* () {
              yield* db
                .insert(slackNotification)
                .values(
                  pending.map((event) => ({
                    id: event.id,
                    projectIntegrationLinkId: event.linkId,
                    payload: event.payload,
                    actorId: event.actorId,
                    availableAt:
                      event.payload.kind === "sprint_started" &&
                      event.payload.startsAt
                        ? DateTime.toDate(
                            DateTime.makeUnsafe(event.payload.startsAt)
                          )
                        : now
                  }))
                )
                .onConflictDoNothing()
              yield* db
                .update(projectIntegrationEvent)
                .set({ consumedAt: now })
                .where(
                  inArray(
                    projectIntegrationEvent.id,
                    pending.map((event) => event.id)
                  )
                )
            })
          )
          .pipe(Effect.orDie)
      })
      return SlackEvents.of({ enqueue })
    })
  )
}
