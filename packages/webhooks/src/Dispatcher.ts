import { Db } from "@pp/db"
import {
  organization,
  projectIntegrationLink,
  webhookDelivery,
  webhookEndpoint
} from "@pp/db/schema"
import {
  and,
  asc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql
} from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import * as Endpoints from "./Endpoints"
import {
  afterAttempt,
  classify,
  maxDeliveryAgeMs,
  minSendIntervalMs,
  type AttemptResult
} from "./policy"
import { trimHistory } from "./retention"
import * as Sender from "./Sender"

const leaseSeconds = 60
const maxAge = sql.raw(`interval '${maxDeliveryAgeMs / 1000} seconds'`)
const sendFloor = sql.raw(`interval '${minSendIntervalMs} milliseconds'`)

const liveOrganization = sql`exists (select 1 from ${organization} where ${organization.id} = ${webhookEndpoint.organizationId} and ${organization.deletedAt} is null)`

export type Claim = Readonly<{ endpointId: string; token: string }>

export class WebhookDispatcher extends Context.Service<
  WebhookDispatcher,
  Readonly<{
    claim: (limit: number) => Effect.Effect<ReadonlyArray<Claim>>
    process: (claim: Claim) => Effect.Effect<void>
    expire: () => Effect.Effect<void>
  }>
>()("@pp/webhooks/Dispatcher/WebhookDispatcher") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const endpoints = yield* Endpoints.WebhookEndpoints
  const sender = yield* Sender.WebhookSender

  const pendingWithinWindow = and(
    eq(webhookDelivery.state, "pending"),
    gt(webhookDelivery.createdAt, sql`now() - ${maxAge}`)
  )

  const trim = (endpointId: string) => trimHistory(db, endpointId)

  const claim = Effect.fn("WebhookDispatcher.claim")(function* (limit: number) {
    if (limit <= 0) return []
    const due = db
      .select({ id: webhookEndpoint.id })
      .from(webhookEndpoint)
      .where(
        and(
          eq(webhookEndpoint.status, "active"),
          liveOrganization,
          lte(webhookEndpoint.nextAttemptAt, sql`now()`),
          or(
            isNull(webhookEndpoint.lastAttemptAt),
            lte(webhookEndpoint.lastAttemptAt, sql`now() - ${sendFloor}`)
          ),
          or(
            isNull(webhookEndpoint.leaseExpiresAt),
            lt(webhookEndpoint.leaseExpiresAt, sql`now()`)
          ),
          exists(
            db
              .select({ one: sql`1` })
              .from(webhookDelivery)
              .where(
                and(
                  eq(webhookDelivery.endpointId, webhookEndpoint.id),
                  pendingWithinWindow
                )
              )
          )
        )
      )
      .orderBy(asc(webhookEndpoint.nextAttemptAt), asc(webhookEndpoint.id))
      .limit(limit)
      .for("update", { skipLocked: true })
    const rows = yield* db
      .update(webhookEndpoint)
      .set({
        leaseToken: sql`gen_random_uuid()::text`,
        leaseExpiresAt: sql`now() + ${sql.raw(`interval '${leaseSeconds} seconds'`)}`
      })
      .where(inArray(webhookEndpoint.id, due))
      .returning({
        endpointId: webhookEndpoint.id,
        token: webhookEndpoint.leaseToken
      })
      .pipe(Effect.orDie)
    return rows.flatMap((row) =>
      row.token === null
        ? []
        : [{ endpointId: row.endpointId, token: row.token }]
    )
  })

  const release = (claim: Claim) =>
    db
      .update(webhookEndpoint)
      .set({ leaseToken: null, leaseExpiresAt: null })
      .where(
        and(
          eq(webhookEndpoint.id, claim.endpointId),
          eq(webhookEndpoint.leaseToken, claim.token)
        )
      )
      .pipe(Effect.orDie)

  const finalize = Effect.fn("WebhookDispatcher.finalize")(function* (
    claim: Claim,
    deliveryId: string,
    result: AttemptResult
  ) {
    const now = yield* DateTime.nowAsDate
    const classification = classify(result)
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          const [endpoint] = yield* db
            .select({
              failureCount: webhookEndpoint.failureCount,
              failingSince: webhookEndpoint.failingSince,
              goneCount: webhookEndpoint.goneCount,
              linkId: webhookEndpoint.projectIntegrationLinkId
            })
            .from(webhookEndpoint)
            .where(
              and(
                eq(webhookEndpoint.id, claim.endpointId),
                eq(webhookEndpoint.leaseToken, claim.token),
                gt(webhookEndpoint.leaseExpiresAt, sql`now()`)
              )
            )
            .for("update")
          if (!endpoint) return
          const finished = classification.state !== "pending"
          yield* db
            .update(webhookDelivery)
            .set({
              attempts: sql`${webhookDelivery.attempts} + 1`,
              lastAttemptAt: now,
              lastStatusCode: result._tag === "Response" ? result.status : null,
              lastOutcome: classification.outcome,
              responseExcerpt:
                result._tag === "Response" ? result.excerpt : null,
              state: classification.state,
              finishedAt: finished ? now : null
            })
            .where(
              and(
                eq(webhookDelivery.id, deliveryId),
                eq(webhookDelivery.state, "pending")
              )
            )
          const update = afterAttempt(endpoint, classification, now)
          yield* db
            .update(webhookEndpoint)
            .set({
              failureCount: update.failureCount,
              failingSince: update.failingSince,
              goneCount: update.goneCount,
              nextAttemptAt: update.nextAttemptAt,
              lastAttemptAt: now,
              ...(update.lastSuccessAt
                ? { lastSuccessAt: update.lastSuccessAt }
                : {}),
              ...(update.disable
                ? {
                    status: "disabled" as const,
                    disabledReason: update.disable,
                    disabledAt: now
                  }
                : {}),
              leaseToken: null,
              leaseExpiresAt: null,
              updatedAt: now
            })
            .where(eq(webhookEndpoint.id, claim.endpointId))
          if (update.disable && endpoint.linkId)
            yield* db
              .update(projectIntegrationLink)
              .set({
                status: "broken",
                lastCheckedAt: now,
                lastCheckStatus: "error",
                lastCheckError: `webhook_${update.disable}`,
                updatedAt: now
              })
              .where(eq(projectIntegrationLink.id, endpoint.linkId))
          if (finished) yield* trim(claim.endpointId)
        })
      )
      .pipe(Effect.orDie)
  })

  const process = Effect.fn("WebhookDispatcher.process")(function* (
    claim: Claim
  ) {
    const [delivery] = yield* db
      .select({
        id: webhookDelivery.id,
        event: webhookDelivery.event,
        body: webhookDelivery.body,
        createdAt: webhookDelivery.createdAt
      })
      .from(webhookDelivery)
      .innerJoin(
        webhookEndpoint,
        eq(webhookEndpoint.id, webhookDelivery.endpointId)
      )
      .where(
        and(
          eq(webhookDelivery.endpointId, claim.endpointId),
          pendingWithinWindow,
          eq(webhookEndpoint.status, "active"),
          liveOrganization,
          eq(webhookEndpoint.leaseToken, claim.token),
          gt(webhookEndpoint.leaseExpiresAt, sql`now()`)
        )
      )
      .orderBy(asc(webhookDelivery.createdAt), asc(webhookDelivery.id))
      .limit(1)
      .pipe(Effect.orDie)
    if (!delivery) return yield* release(claim)
    const result = yield* endpoints.target(claim.endpointId).pipe(
      Effect.flatMap((target) => sender.send(target, delivery)),
      Effect.catchTag("WebhookSecretError", () =>
        Effect.succeed({
          _tag: "Failure",
          reason: "configuration"
        } satisfies AttemptResult)
      )
    )
    yield* finalize(claim, delivery.id, result)
  })

  const expire = Effect.fn("WebhookDispatcher.expire")(function* () {
    const expired = yield* db
      .update(webhookDelivery)
      .set({
        state: "expired",
        lastOutcome: sql`coalesce(${webhookDelivery.lastOutcome}, 'expired')`,
        finishedAt: sql`now()`
      })
      .where(
        and(
          eq(webhookDelivery.state, "pending"),
          lte(webhookDelivery.createdAt, sql`now() - ${maxAge}`)
        )
      )
      .returning({ endpointId: webhookDelivery.endpointId })
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      [...new Set(expired.map((row) => row.endpointId))],
      (endpointId) => trim(endpointId).pipe(Effect.orDie),
      { discard: true }
    )
  })

  return WebhookDispatcher.of({ claim, process, expire })
})

export const layer = Layer.effect(WebhookDispatcher, make)
