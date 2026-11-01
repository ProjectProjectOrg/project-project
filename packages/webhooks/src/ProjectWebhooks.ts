import { Db } from "@pp/db"
import {
  organization,
  organizationIntegration,
  projectIntegrationLink,
  webhookDelivery,
  webhookEndpoint
} from "@pp/db/schema"
import {
  Conflict,
  NotFound,
  ProjectScope,
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type Validation,
  type Webhook,
  type WebhookDelivery,
  type WebhookWithSecret
} from "@pp/shared"
import { and, desc, eq, inArray, sql } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import * as Endpoints from "./Endpoints"
import { pingEnvelope, pingEvent } from "./envelope"
import { publicUrl } from "./Events"
import { maxDeliveryAgeMs } from "./policy"

const listedDeliveries = 60

const webhookColumns = {
  id: webhookEndpoint.id,
  url: webhookEndpoint.urlDisplay,
  events: projectIntegrationLink.subscribedEvents,
  headerNames: webhookEndpoint.headerNames,
  secretFingerprint: webhookEndpoint.secretFingerprint,
  status: webhookEndpoint.status,
  disabledReason: webhookEndpoint.disabledReason,
  disabledAt: webhookEndpoint.disabledAt,
  failureCount: webhookEndpoint.failureCount,
  nextAttemptAt: webhookEndpoint.nextAttemptAt,
  lastSuccessAt: webhookEndpoint.lastSuccessAt,
  createdAt: webhookEndpoint.createdAt
}

const deliveryColumns = {
  id: webhookDelivery.id,
  event: webhookDelivery.event,
  kind: webhookDelivery.kind,
  state: webhookDelivery.state,
  attempts: webhookDelivery.attempts,
  lastAttemptAt: webhookDelivery.lastAttemptAt,
  lastStatusCode: webhookDelivery.lastStatusCode,
  lastOutcome: webhookDelivery.lastOutcome,
  responseExcerpt: webhookDelivery.responseExcerpt,
  createdAt: webhookDelivery.createdAt,
  finishedAt: webhookDelivery.finishedAt
}

const inProject = (projectId: string) =>
  and(
    eq(projectIntegrationLink.projectId, projectId),
    eq(projectIntegrationLink.provider, "webhook"),
    inArray(projectIntegrationLink.status, ["active", "broken"])
  )

type Scoped<A, E = never> = Effect.Effect<A, E, ProjectScope>

export class ProjectWebhooks extends Context.Service<
  ProjectWebhooks,
  Readonly<{
    list: () => Scoped<ReadonlyArray<Webhook>>
    create: (input: CreateWebhookInput) => Scoped<WebhookWithSecret, Validation>
    update: (
      id: string,
      input: UpdateWebhookInput
    ) => Scoped<Webhook, NotFound | Validation>
    remove: (id: string) => Scoped<void, NotFound>
    rotateSecret: (id: string) => Scoped<WebhookWithSecret, NotFound>
    enable: (id: string) => Scoped<Webhook, NotFound>
    disable: (id: string) => Scoped<Webhook, NotFound>
    test: (id: string) => Scoped<WebhookDelivery, NotFound | Conflict>
    deliveries: (id: string) => Scoped<ReadonlyArray<WebhookDelivery>, NotFound>
    retryDelivery: (
      id: string,
      deliveryId: string
    ) => Scoped<WebhookDelivery, NotFound | Conflict>
  }>
>()("@pp/webhooks/ProjectWebhooks") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const crypto = yield* Crypto.Crypto
  const endpoints = yield* Endpoints.WebhookEndpoints
  const baseUrl = yield* publicUrl

  const select = (projectId: string, id?: string) =>
    db
      .select(webhookColumns)
      .from(webhookEndpoint)
      .innerJoin(
        projectIntegrationLink,
        eq(projectIntegrationLink.id, webhookEndpoint.projectIntegrationLinkId)
      )
      .where(
        id === undefined
          ? inProject(projectId)
          : and(inProject(projectId), eq(webhookEndpoint.id, id))
      )
      .orderBy(webhookEndpoint.createdAt)
      .pipe(Effect.orDie)

  const find = Effect.fn("ProjectWebhooks.find")(function* (id: string) {
    const scope = yield* ProjectScope
    const [row] = yield* select(scope.projectId, id)
    if (!row) return yield* new NotFound()
    return row
  })

  const list = Effect.fn("ProjectWebhooks.list")(function* () {
    const scope = yield* ProjectScope
    return yield* select(scope.projectId)
  })

  const webhookIntegration = (organizationId: string) =>
    Effect.gen(function* () {
      yield* db
        .select({ id: organization.id })
        .from(organization)
        .where(eq(organization.id, organizationId))
        .for("update")
      const [existing] = yield* db
        .select({ id: organizationIntegration.id })
        .from(organizationIntegration)
        .where(
          and(
            eq(organizationIntegration.organizationId, organizationId),
            eq(organizationIntegration.provider, "webhook"),
            eq(organizationIntegration.status, "active")
          )
        )
        .limit(1)
      if (existing) return existing.id
      const [created] = yield* db
        .insert(organizationIntegration)
        .values({ organizationId, provider: "webhook", status: "active" })
        .returning({ id: organizationIntegration.id })
      if (!created) return yield* Effect.die("webhook integration not created")
      return created.id
    })

  const create = Effect.fn("ProjectWebhooks.create")(function* (
    input: CreateWebhookInput
  ) {
    const scope = yield* ProjectScope
    const created = yield* db
      .transaction(() =>
        Effect.gen(function* () {
          const integrationId = yield* webhookIntegration(scope.organizationId)
          const [link] = yield* db
            .insert(projectIntegrationLink)
            .values({
              projectId: scope.projectId,
              organizationId: scope.organizationId,
              organizationIntegrationId: integrationId,
              provider: "webhook",
              status: "active",
              subscribedEvents: [...new Set(input.events)]
            })
            .returning({ id: projectIntegrationLink.id })
          if (!link) return yield* Effect.die("webhook link not created")
          return yield* endpoints.create({
            organizationId: scope.organizationId,
            projectIntegrationLinkId: link.id,
            url: input.url,
            headers: input.headers ?? []
          })
        })
      )
      .pipe(
        Effect.catchTags({
          SqlError: Effect.die,
          EffectDrizzleQueryError: Effect.die
        })
      )
    const webhook = yield* find(created.id).pipe(
      Effect.catchTag("NotFound", Effect.die)
    )
    return { webhook, secret: created.secret }
  })

  const update = Effect.fn("ProjectWebhooks.update")(function* (
    id: string,
    input: UpdateWebhookInput
  ) {
    yield* find(id)
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          yield* endpoints.update(id, {
            ...(input.url === undefined ? {} : { url: input.url }),
            ...(input.headers === undefined ? {} : { headers: input.headers })
          })
          if (input.events === undefined) return
          yield* db
            .update(projectIntegrationLink)
            .set({
              subscribedEvents: [...new Set(input.events)],
              updatedAt: sql`now()`
            })
            .where(
              eq(
                projectIntegrationLink.id,
                db
                  .select({ id: webhookEndpoint.projectIntegrationLinkId })
                  .from(webhookEndpoint)
                  .where(eq(webhookEndpoint.id, id))
              )
            )
        })
      )
      .pipe(
        Effect.catchTags({
          SqlError: Effect.die,
          EffectDrizzleQueryError: Effect.die
        })
      )
    return yield* find(id)
  })

  const remove = Effect.fn("ProjectWebhooks.remove")(function* (id: string) {
    yield* find(id)
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          const [row] = yield* db
            .delete(webhookEndpoint)
            .where(eq(webhookEndpoint.id, id))
            .returning({ linkId: webhookEndpoint.projectIntegrationLinkId })
          if (row?.linkId)
            yield* db
              .update(projectIntegrationLink)
              .set({
                status: "disconnected",
                disconnectedAt: sql`now()`,
                updatedAt: sql`now()`
              })
              .where(eq(projectIntegrationLink.id, row.linkId))
        })
      )
      .pipe(Effect.orDie)
  })

  const rotateSecret = Effect.fn("ProjectWebhooks.rotateSecret")(function* (
    id: string
  ) {
    yield* find(id)
    const secret = yield* endpoints.rotateSecret(id)
    return { webhook: yield* find(id), secret }
  })

  const enable = Effect.fn("ProjectWebhooks.enable")(function* (id: string) {
    yield* find(id)
    yield* endpoints.enable(id)
    return yield* find(id)
  })

  const disable = Effect.fn("ProjectWebhooks.disable")(function* (id: string) {
    yield* find(id)
    yield* endpoints.disable(id)
    return yield* find(id)
  })

  const delivery = (endpointId: string, deliveryId: string) =>
    db
      .select(deliveryColumns)
      .from(webhookDelivery)
      .where(
        and(
          eq(webhookDelivery.endpointId, endpointId),
          eq(webhookDelivery.id, deliveryId)
        )
      )
      .limit(1)
      .pipe(
        Effect.orDie,
        Effect.flatMap(([row]) =>
          row ? Effect.succeed(row) : Effect.fail(new NotFound())
        )
      )

  const test = Effect.fn("ProjectWebhooks.test")(function* (id: string) {
    const scope = yield* ProjectScope
    const webhook = yield* find(id)
    if (webhook.status === "disabled")
      return yield* new Conflict({ reason: "webhook_disabled" })
    const deliveryId = yield* crypto.randomUUIDv7().pipe(Effect.orDie)
    const createdAt = yield* DateTime.nowAsDate
    yield* endpoints.enqueue({
      id: deliveryId,
      endpointId: id,
      event: pingEvent,
      kind: "test",
      createdAt,
      body: pingEnvelope({
        deliveryId,
        createdAt,
        orgSlug: scope.orgSlug,
        projectSlug: scope.slug,
        actor: null,
        baseUrl
      })
    })
    return yield* delivery(id, deliveryId)
  })

  const deliveries = Effect.fn("ProjectWebhooks.deliveries")(function* (
    id: string
  ) {
    yield* find(id)
    return yield* db
      .select(deliveryColumns)
      .from(webhookDelivery)
      .where(eq(webhookDelivery.endpointId, id))
      .orderBy(desc(webhookDelivery.createdAt), desc(webhookDelivery.id))
      .limit(listedDeliveries)
      .pipe(Effect.orDie)
  })

  const retryDelivery = Effect.fn("ProjectWebhooks.retryDelivery")(function* (
    id: string,
    deliveryId: string
  ) {
    yield* find(id)
    const now = yield* DateTime.nowAsDate
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          const [endpoint] = yield* db
            .select({ status: webhookEndpoint.status })
            .from(webhookEndpoint)
            .where(eq(webhookEndpoint.id, id))
            .for("update")
          if (endpoint?.status !== "active")
            return yield* new Conflict({ reason: "webhook_disabled" })
          const row = yield* delivery(id, deliveryId)
          if (row.state === "delivered")
            return yield* new Conflict({ reason: "webhook_delivery_delivered" })
          if (row.lastOutcome === "body_too_large")
            return yield* new Conflict({ reason: "webhook_delivery_too_large" })
          if (now.getTime() - row.createdAt.getTime() >= maxDeliveryAgeMs)
            return yield* new Conflict({ reason: "webhook_delivery_too_old" })
          if (row.state !== "pending")
            yield* db
              .update(webhookDelivery)
              .set({ state: "pending", finishedAt: null })
              .where(eq(webhookDelivery.id, deliveryId))
          yield* db
            .update(webhookEndpoint)
            .set({
              failureCount: 0,
              failingSince: null,
              goneCount: 0,
              nextAttemptAt: now,
              updatedAt: now
            })
            .where(eq(webhookEndpoint.id, id))
        })
      )
      .pipe(
        Effect.catchTags({
          SqlError: Effect.die,
          EffectDrizzleQueryError: Effect.die
        })
      )
    return yield* delivery(id, deliveryId)
  })

  return ProjectWebhooks.of({
    list,
    create,
    update,
    remove,
    rotateSecret,
    enable,
    disable,
    test,
    deliveries,
    retryDelivery
  })
})

export const layer = Layer.effect(ProjectWebhooks, make)
