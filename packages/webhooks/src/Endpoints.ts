import { Db } from "@pp/db"
import {
  projectIntegrationLink,
  webhookDelivery,
  webhookEndpoint
} from "@pp/db/schema"
import { Validation, type WebhookHeader } from "@pp/shared"
import { eq, sql } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import { bodyBytes, maxBodyBytes } from "./envelope"
import { WebhookHost, type WebhookSecretError } from "./Host"
import * as Sender from "./Sender"
import { fingerprint, generateSecret } from "./signature"

const HeaderList = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String }))
)
const encodeHeaders = Schema.encodeSync(HeaderList)
const decodeHeaders = Schema.decodeUnknownEffect(HeaderList)

export const displayUrl = (raw: string) => {
  const url = new URL(raw)
  const bare = url.pathname === "/" && url.search === ""
  return `${url.protocol}//${url.host}${bare ? "" : "/…"}`
}

type HeaderColumns = Readonly<{
  headerNames: ReadonlyArray<string>
  headersCiphertext: string | null
  headersNonce: string | null
  headersTag: string | null
}>

export type EndpointInput = Readonly<{
  organizationId: string
  projectIntegrationLinkId: string | null
  url: string
  headers: ReadonlyArray<WebhookHeader>
}>

export type EndpointChanges = Readonly<{
  url?: string
  headers?: ReadonlyArray<WebhookHeader>
}>

export type QueuedDelivery = Readonly<{
  id: string
  endpointId: string
  event: string
  body: string
  createdAt: Date
  kind: "event" | "test"
}>

export class WebhookEndpoints extends Context.Service<
  WebhookEndpoints,
  Readonly<{
    create: (
      input: EndpointInput
    ) => Effect.Effect<Readonly<{ id: string; secret: string }>, Validation>
    update: (
      id: string,
      changes: EndpointChanges
    ) => Effect.Effect<void, Validation>
    rotateSecret: (id: string) => Effect.Effect<string>
    enable: (id: string) => Effect.Effect<void>
    disable: (id: string) => Effect.Effect<void>
    enqueue: (delivery: QueuedDelivery) => Effect.Effect<void>
    target: (id: string) => Effect.Effect<Sender.Target, WebhookSecretError>
  }>
>()("@pp/webhooks/Endpoints/WebhookEndpoints") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const host = yield* WebhookHost
  const sender = yield* Sender.WebhookSender

  const validate = Effect.fn("WebhookEndpoints.validate")(function* (
    url: string | undefined,
    headers: ReadonlyArray<WebhookHeader> | undefined
  ) {
    if (url !== undefined) {
      const problem = yield* sender.check(url)
      if (problem !== null)
        return yield* new Validation({ reason: `webhook_url_${problem}` })
    }
    if (headers?.some((header) => Sender.isReservedHeader(header.name)))
      return yield* new Validation({ reason: "webhook_header_reserved" })
    const names = headers?.map((header) => header.name.toLowerCase()) ?? []
    if (new Set(names).size !== names.length)
      return yield* new Validation({ reason: "webhook_header_duplicate" })
  })

  const sealHeaders = (
    headers: ReadonlyArray<WebhookHeader>
  ): Effect.Effect<HeaderColumns, WebhookSecretError> =>
    headers.length === 0
      ? Effect.succeed({
          headerNames: [],
          headersCiphertext: null,
          headersNonce: null,
          headersTag: null
        })
      : host.seal(encodeHeaders(headers)).pipe(
          Effect.map((sealed) => ({
            headerNames: headers.map((header) => header.name),
            headersCiphertext: sealed.ciphertext,
            headersNonce: sealed.nonce,
            headersTag: sealed.tag
          }))
        )

  const sealUrl = (url: string) =>
    host.seal(url).pipe(
      Effect.map((sealed) => ({
        urlDisplay: displayUrl(url),
        urlCiphertext: sealed.ciphertext,
        urlNonce: sealed.nonce,
        urlTag: sealed.tag
      }))
    )

  const sealSecret = (secret: string) =>
    host.seal(secret).pipe(
      Effect.map((sealed) => ({
        secretCiphertext: sealed.ciphertext,
        secretNonce: sealed.nonce,
        secretTag: sealed.tag,
        secretFingerprint: fingerprint(secret)
      }))
    )

  const reset = {
    failureCount: 0,
    failingSince: null,
    goneCount: 0,
    nextAttemptAt: sql`now()`,
    leaseToken: null,
    leaseExpiresAt: null,
    updatedAt: sql`now()`
  }

  const healthy = {
    ...reset,
    status: "active" as const,
    disabledReason: null,
    disabledAt: null
  }

  const lock = (id: string) =>
    db
      .select({ id: webhookEndpoint.id })
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.id, id))
      .for("update")

  const create = Effect.fn("WebhookEndpoints.create")(function* (
    input: EndpointInput
  ) {
    yield* validate(input.url, input.headers)
    const secret = generateSecret()
    const values = {
      organizationId: input.organizationId,
      projectIntegrationLinkId: input.projectIntegrationLinkId,
      ...(yield* sealUrl(input.url).pipe(Effect.orDie)),
      ...(yield* sealSecret(secret).pipe(Effect.orDie)),
      ...(yield* sealHeaders(input.headers).pipe(Effect.orDie)),
      status: "active" as const
    }
    const [row] = yield* db
      .insert(webhookEndpoint)
      .values(values)
      .returning({ id: webhookEndpoint.id })
      .pipe(Effect.orDie)
    if (!row) return yield* Effect.die("webhook endpoint was not created")
    return { id: row.id, secret }
  })

  const update = Effect.fn("WebhookEndpoints.update")(function* (
    id: string,
    changes: EndpointChanges
  ) {
    yield* validate(changes.url, changes.headers)
    const url =
      changes.url === undefined
        ? {}
        : yield* sealUrl(changes.url).pipe(Effect.orDie)
    const headers =
      changes.headers === undefined
        ? {}
        : yield* sealHeaders(changes.headers).pipe(Effect.orDie)
    if (changes.url === undefined && changes.headers === undefined) return
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          yield* lock(id)
          yield* db
            .update(webhookEndpoint)
            .set({
              ...url,
              ...headers,
              ...(changes.url === undefined
                ? {
                    leaseToken: null,
                    leaseExpiresAt: null,
                    updatedAt: sql`now()`
                  }
                : reset)
            })
            .where(eq(webhookEndpoint.id, id))
        })
      )
      .pipe(Effect.orDie)
  })

  const rotateSecret = Effect.fn("WebhookEndpoints.rotateSecret")(function* (
    id: string
  ) {
    const secret = generateSecret()
    const sealed = yield* sealSecret(secret).pipe(Effect.orDie)
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          yield* lock(id)
          yield* db
            .update(webhookEndpoint)
            .set({
              ...sealed,
              leaseToken: null,
              leaseExpiresAt: null,
              updatedAt: sql`now()`
            })
            .where(eq(webhookEndpoint.id, id))
        })
      )
      .pipe(Effect.orDie)
    return secret
  })

  const enable = Effect.fn("WebhookEndpoints.enable")(function* (id: string) {
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          yield* lock(id)
          const [row] = yield* db
            .update(webhookEndpoint)
            .set(healthy)
            .where(eq(webhookEndpoint.id, id))
            .returning({ linkId: webhookEndpoint.projectIntegrationLinkId })
          if (row?.linkId)
            yield* db
              .update(projectIntegrationLink)
              .set({
                status: "active",
                lastCheckStatus: "ok",
                lastCheckError: null,
                updatedAt: sql`now()`
              })
              .where(eq(projectIntegrationLink.id, row.linkId))
        })
      )
      .pipe(Effect.orDie)
  })

  const disable = Effect.fn("WebhookEndpoints.disable")(function* (id: string) {
    yield* db
      .transaction(() =>
        Effect.gen(function* () {
          yield* lock(id)
          const [row] = yield* db
            .update(webhookEndpoint)
            .set({
              status: "disabled",
              disabledReason: "manual",
              disabledAt: sql`now()`,
              leaseToken: null,
              leaseExpiresAt: null,
              updatedAt: sql`now()`
            })
            .where(eq(webhookEndpoint.id, id))
            .returning({ linkId: webhookEndpoint.projectIntegrationLinkId })
          if (row?.linkId)
            yield* db
              .update(projectIntegrationLink)
              .set({
                status: "broken",
                lastCheckStatus: "error",
                lastCheckError: "webhook_manual",
                updatedAt: sql`now()`
              })
              .where(eq(projectIntegrationLink.id, row.linkId))
        })
      )
      .pipe(Effect.orDie)
  })

  const enqueue = Effect.fn("WebhookEndpoints.enqueue")(function* (
    delivery: QueuedDelivery
  ) {
    const tooLarge = bodyBytes(delivery.body) > maxBodyBytes
    yield* db
      .insert(webhookDelivery)
      .values({
        ...delivery,
        state: tooLarge ? "failed" : "pending",
        lastOutcome: tooLarge ? "body_too_large" : null,
        finishedAt: tooLarge ? sql`now()` : null
      })
      .onConflictDoNothing()
      .pipe(Effect.orDie)
  })

  const target = Effect.fn("WebhookEndpoints.target")(function* (id: string) {
    const [row] = yield* db
      .select()
      .from(webhookEndpoint)
      .where(eq(webhookEndpoint.id, id))
      .limit(1)
      .pipe(Effect.orDie)
    if (!row) return yield* Effect.die("webhook endpoint is gone")
    const url = yield* host.open({
      ciphertext: row.urlCiphertext,
      nonce: row.urlNonce,
      tag: row.urlTag
    })
    const secret = yield* host.open({
      ciphertext: row.secretCiphertext,
      nonce: row.secretNonce,
      tag: row.secretTag
    })
    const headers =
      row.headersCiphertext && row.headersNonce && row.headersTag
        ? yield* host
            .open({
              ciphertext: row.headersCiphertext,
              nonce: row.headersNonce,
              tag: row.headersTag
            })
            .pipe(Effect.flatMap(decodeHeaders), Effect.orDie)
        : []
    return { url, secret, headers }
  })

  return WebhookEndpoints.of({
    create,
    update,
    rotateSecret,
    enable,
    disable,
    enqueue,
    target
  })
})

export const layer = Layer.effect(WebhookEndpoints, make)
