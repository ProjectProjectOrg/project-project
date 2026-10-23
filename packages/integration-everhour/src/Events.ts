import { Db } from "@pp/db"
import {
  projectEverhourIntegration,
  projectIntegrationEvent,
  projectIntegrationLink
} from "@pp/db/schema"
import type { ProjectEventKind } from "@pp/shared"
import { and, eq, inArray, isNull } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const EVERHOUR_EVENTS = [
  "sprint_created",
  "sprint_renamed",
  "sprint_completed",
  "sprint_reopened",
  "sprint_deleted"
] satisfies ReadonlyArray<ProjectEventKind>

export class EverhourEvents extends Context.Service<
  EverhourEvents,
  Readonly<{ enqueue: () => Effect.Effect<void> }>
>()("@pp/integration-everhour/Events/EverhourEvents") {
  static readonly layer = Layer.effect(
    EverhourEvents,
    Effect.gen(function* () {
      const db = yield* Db
      const enqueue = Effect.fn("Everhour.enqueueEvents")(function* () {
        const pending = yield* db
          .select({
            id: projectIntegrationEvent.id,
            linkId: projectIntegrationEvent.projectIntegrationLinkId
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
              eq(projectIntegrationLink.provider, "everhour"),
              isNull(projectIntegrationEvent.consumedAt)
            )
          )
          .limit(500)
          .pipe(Effect.orDie)
        if (pending.length === 0) return
        const now = yield* DateTime.nowAsDate
        yield* db
          .transaction(() =>
            Effect.gen(function* () {
              yield* db
                .update(projectEverhourIntegration)
                .set({ syncRequestedAt: now })
                .where(
                  inArray(projectEverhourIntegration.projectIntegrationLinkId, [
                    ...new Set(pending.map((event) => event.linkId))
                  ])
                )
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
      return EverhourEvents.of({ enqueue })
    })
  )
}
