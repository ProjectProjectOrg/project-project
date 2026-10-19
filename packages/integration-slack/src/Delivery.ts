import { Db } from "@pp/db"
import {
  organization,
  organizationIntegration,
  projectIndex,
  projectIntegrationLink,
  projectSlackIntegration,
  projectStatus,
  slackNotification,
  user
} from "@pp/db/schema"
import { SlackNotification } from "@pp/shared"
import { and, eq, isNotNull, isNull } from "drizzle-orm"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { isSqlError } from "effect/unstable/sql/SqlError"
import { Activity, DurableClock, Workflow } from "effect/unstable/workflow"

import { SlackClient } from "./Client"
import { SlackHost } from "./Host"
import { SlackIntegrations, slackPublicUrl } from "./Integrations"
import { notificationMessage, ticketLink } from "./messages"

const DeliveryOutcome = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("done") }),
  Schema.Struct({ kind: Schema.Literal("retry"), seconds: Schema.Finite })
])
export const SlackDeliveryWorkflow = Workflow.make(
  "ProjectProject/SlackDelivery/v1",
  {
    payload: Schema.Struct({ id: Schema.String }),
    success: Schema.Void,
    idempotencyKey: ({ id }) => id
  }
)

export const makeSlackDelivery = Effect.gen(function* () {
  const db = yield* Db
  const client = yield* SlackClient
  const integrations = yield* SlackIntegrations
  const host = yield* SlackHost
  const baseUrl = yield* slackPublicUrl
  const finish = Effect.fn("Slack.finishDelivery")(function* (
    id: string,
    error: string | null
  ) {
    const now = yield* DateTime.nowAsDate
    yield* db
      .update(slackNotification)
      .set({ finishedAt: now, error })
      .where(
        and(eq(slackNotification.id, id), isNull(slackNotification.finishedAt))
      )
      .pipe(Effect.orDie)
  })
  const deliver = Effect.fn("Slack.deliver")(
    function* (
      id: string,
      attempt: number
    ): Effect.fn.Return<typeof DeliveryOutcome.Type> {
      const [row] = yield* db
        .select({
          payload: slackNotification.payload,
          actorId: slackNotification.actorId,
          organizationId: projectIntegrationLink.organizationId,
          orgSlug: organization.slug,
          slug: projectIndex.slug,
          projectId: projectIndex.id,
          channelId: projectSlackIntegration.channelId,
          events: projectIntegrationLink.subscribedEvents
        })
        .from(slackNotification)
        .innerJoin(
          projectIntegrationLink,
          eq(
            projectIntegrationLink.id,
            slackNotification.projectIntegrationLinkId
          )
        )
        .innerJoin(
          projectSlackIntegration,
          eq(
            projectSlackIntegration.projectIntegrationLinkId,
            projectIntegrationLink.id
          )
        )
        .innerJoin(
          organizationIntegration,
          eq(
            organizationIntegration.id,
            projectIntegrationLink.organizationIntegrationId
          )
        )
        .innerJoin(
          projectIndex,
          eq(projectIndex.id, projectIntegrationLink.projectId)
        )
        .innerJoin(
          organization,
          eq(organization.id, projectIntegrationLink.organizationId)
        )
        .where(
          and(
            eq(slackNotification.id, id),
            isNull(slackNotification.finishedAt),
            eq(projectIntegrationLink.status, "active"),
            eq(organizationIntegration.status, "active"),
            isNull(organization.deletedAt),
            isNotNull(projectIndex.publishedAt)
          )
        )
        .limit(1)
        .pipe(Effect.orDie)
      if (!row) {
        yield* finish(id, "connection_changed")
        return { kind: "done" }
      }
      const event = yield* Schema.decodeEffect(SlackNotification)(
        row.payload
      ).pipe(Effect.orDie)
      if (
        event.kind !== "test" &&
        !row.events.some((kind) => kind === event.kind)
      ) {
        yield* finish(id, "event_disabled")
        return { kind: "done" }
      }
      if (event.kind === "sprint_started") {
        const group = yield* host.sprint({
          orgSlug: row.orgSlug,
          slug: row.slug,
          id: event.id
        })
        if (
          group === null ||
          group.completed ||
          group.startsAt?.getTime() !== event.startsAt?.getTime()
        ) {
          yield* finish(id, "sprint_changed")
          return { kind: "done" }
        }
      }
      const [actor] = row.actorId
        ? yield* db
            .select({ name: user.name })
            .from(user)
            .where(eq(user.id, row.actorId))
            .limit(1)
            .pipe(Effect.orDie)
        : []
      const status =
        "status" in event
          ? yield* db
              .select({ label: projectStatus.label })
              .from(projectStatus)
              .where(
                and(
                  eq(projectStatus.projectId, row.projectId),
                  eq(projectStatus.slug, event.status)
                )
              )
              .limit(1)
              .pipe(Effect.orDie)
          : []
      const url =
        "status" in event
          ? ticketLink(baseUrl, row.orgSlug, row.slug, event.id)
          : new URL(
              `/orgs/${row.orgSlug}/projects/${row.slug}${event.kind === "test" ? "/settings/integrations" : `/sprints/${event.id}`}`,
              baseUrl
            ).toString()
      const outcome = yield* Effect.gen(function* () {
        const credentials = yield* integrations.credentials(row.organizationId)
        yield* client.send(
          credentials.botToken,
          row.channelId,
          id,
          notificationMessage({
            notification: event,
            actor: actor?.name ?? "ProjectProject",
            url,
            statusLabel: status[0]?.label ?? null
          })
        )
        yield* finish(id, null)
        return { kind: "done" as const }
      }).pipe(
        Effect.catch((error): Effect.Effect<typeof DeliveryOutcome.Type> => {
          const retryable =
            error._tag === "SlackRateLimited" ||
            (error._tag === "SlackError" &&
              [
                "connection",
                "unavailable",
                "internal_error",
                "fatal_error",
                "service_unavailable"
              ].includes(error.reason))
          return retryable && attempt < 12
            ? Effect.succeed({
                kind: "retry" as const,
                seconds:
                  error._tag === "SlackRateLimited"
                    ? Math.max(1, error.retryAfterSeconds)
                    : Math.min(3600, 2 ** attempt)
              })
            : finish(
                id,
                error._tag === "SlackError" ? error.reason : error._tag
              ).pipe(Effect.as({ kind: "done" as const }))
        })
      )
      return outcome
    },
    (effect, id, attempt) =>
      effect.pipe(
        Effect.catchDefect((defect) => {
          const cause = Predicate.hasProperty(defect, "cause")
            ? defect.cause
            : undefined
          const error = Cause.isCause(cause)
            ? Option.getOrUndefined(Cause.findErrorOption(cause))
            : defect
          if (!isSqlError(error) || !error.isRetryable)
            return Effect.die(defect)
          return Effect.gen(function* () {
            yield* Effect.logWarning("Slack delivery hit a database failure", {
              id,
              attempt
            })
            if (attempt < 12)
              return {
                kind: "retry" as const,
                seconds: Math.min(3600, 2 ** attempt)
              }
            yield* finish(id, "database_unavailable")
            return { kind: "done" as const }
          })
        })
      )
  )
  return { deliver }
})

export class SlackDelivery extends Context.Service<
  SlackDelivery,
  Effect.Success<typeof makeSlackDelivery>
>()("@pp/integration-slack/Delivery/SlackDelivery") {
  static readonly layer = Layer.effect(SlackDelivery, makeSlackDelivery)
}

export const SlackDeliveryWorkflowLive = Layer.unwrap(
  Effect.gen(function* () {
    const delivery = yield* SlackDelivery
    return SlackDeliveryWorkflow.toLayer(({ id }) =>
      Effect.gen(function* () {
        for (let attempt = 0; attempt <= 12; attempt++) {
          const outcome = yield* Activity.make({
            name: `deliver/${attempt}`,
            success: DeliveryOutcome,
            execute: delivery.deliver(id, attempt)
          })
          if (outcome.kind === "done") return
          yield* DurableClock.sleep({
            name: `retry/${attempt}`,
            duration: `${outcome.seconds} seconds`,
            inMemoryThreshold: 0
          })
        }
      })
    )
  })
)
