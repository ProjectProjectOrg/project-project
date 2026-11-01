import { Db } from "@pp/db"
import {
  organization,
  projectIndex,
  projectIntegrationEvent,
  projectIntegrationLink,
  user,
  webhookDelivery,
  webhookEndpoint
} from "@pp/db/schema"
import { ProjectEvent } from "@pp/shared"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { bodyBytes, eventEnvelope, maxBodyBytes } from "./envelope"

const decodeEvent = Schema.decodeUnknownOption(ProjectEvent)

export const publicUrl = Config.String("BETTER_AUTH_URL").pipe(
  Config.withDefault("http://localhost:5173")
)

export class WebhookEvents extends Context.Service<
  WebhookEvents,
  Readonly<{ enqueue: () => Effect.Effect<void> }>
>()("@pp/webhooks/Events/WebhookEvents") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const baseUrl = yield* publicUrl

  const enqueue = Effect.fn("WebhookEvents.enqueue")(function* () {
    const pending = yield* db
      .select({
        id: projectIntegrationEvent.id,
        payload: projectIntegrationEvent.payload,
        createdAt: projectIntegrationEvent.createdAt,
        actorId: projectIntegrationEvent.actorId,
        actorName: user.name,
        endpointId: webhookEndpoint.id,
        orgSlug: organization.slug,
        projectSlug: projectIndex.slug
      })
      .from(projectIntegrationEvent)
      .innerJoin(
        projectIntegrationLink,
        eq(
          projectIntegrationLink.id,
          projectIntegrationEvent.projectIntegrationLinkId
        )
      )
      .innerJoin(
        organization,
        eq(organization.id, projectIntegrationLink.organizationId)
      )
      .innerJoin(
        projectIndex,
        eq(projectIndex.id, projectIntegrationLink.projectId)
      )
      .leftJoin(
        webhookEndpoint,
        eq(webhookEndpoint.projectIntegrationLinkId, projectIntegrationLink.id)
      )
      .leftJoin(user, eq(user.id, projectIntegrationEvent.actorId))
      .where(
        and(
          eq(projectIntegrationLink.provider, "webhook"),
          isNull(projectIntegrationEvent.consumedAt)
        )
      )
      .orderBy(asc(projectIntegrationEvent.createdAt))
      .limit(100)
      .pipe(Effect.orDie)
    if (pending.length === 0) return
    const deliveries = pending.flatMap((row) => {
      if (row.endpointId === null) return []
      const event = decodeEvent(row.payload)
      if (Option.isNone(event)) return []
      const body = eventEnvelope(event.value, {
        deliveryId: row.id,
        createdAt: row.createdAt,
        orgSlug: row.orgSlug,
        projectSlug: row.projectSlug,
        actor:
          row.actorId === null
            ? null
            : { id: row.actorId, name: row.actorName ?? "" },
        baseUrl
      })
      const tooLarge = bodyBytes(body) > maxBodyBytes
      return [
        {
          id: row.id,
          endpointId: row.endpointId,
          event: event.value.kind,
          body,
          kind: "event" as const,
          createdAt: row.createdAt,
          state: tooLarge ? ("failed" as const) : ("pending" as const),
          lastOutcome: tooLarge ? "body_too_large" : null,
          finishedAt: tooLarge ? row.createdAt : null
        }
      ]
    })
    const consumedAt = yield* DateTime.nowAsDate
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          if (deliveries.length > 0)
            yield* db
              .insert(webhookDelivery)
              .values(deliveries)
              .onConflictDoNothing()
          yield* db
            .update(projectIntegrationEvent)
            .set({ consumedAt })
            .where(
              inArray(
                projectIntegrationEvent.id,
                pending.map((row) => row.id)
              )
            )
        })
      )
      .pipe(Effect.orDie)
  })

  return WebhookEvents.of({ enqueue })
})

export const layer = Layer.effect(WebhookEvents, make)
