import * as Schema from "effect/Schema"

import { ProjectEventKind } from "./ProjectEvent"

export const WebhookId = Schema.String.check(Schema.isUUID())
export type WebhookId = typeof WebhookId.Type

export const WebhookDeliveryId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(64)
)

export const WebhookUrl = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(2048)
)

export const WebhookHeaderName = Schema.String.check(
  Schema.isPattern(/^[A-Za-z0-9!#$%&'*+.^_`|~-]{1,64}$/u)
)

export const WebhookHeader = Schema.Struct({
  name: WebhookHeaderName,
  value: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(4096),
    Schema.isPattern(/^[\t\x20-\x7e]*$/u)
  )
})
export type WebhookHeader = typeof WebhookHeader.Type

const WebhookEvents = Schema.Array(ProjectEventKind).check(
  Schema.isMinLength(1)
)
const WebhookHeaders = Schema.Array(WebhookHeader).check(Schema.isMaxLength(10))

export const CreateWebhookInput = Schema.Struct({
  url: WebhookUrl,
  events: WebhookEvents,
  headers: Schema.optionalKey(WebhookHeaders)
})
export type CreateWebhookInput = typeof CreateWebhookInput.Type

export const UpdateWebhookInput = Schema.Struct({
  url: Schema.optionalKey(WebhookUrl),
  events: Schema.optionalKey(WebhookEvents),
  headers: Schema.optionalKey(WebhookHeaders)
})
export type UpdateWebhookInput = typeof UpdateWebhookInput.Type

export const WebhookStatus = Schema.Literals(["active", "disabled"])

export const Webhook = Schema.Struct({
  id: WebhookId,
  url: Schema.String,
  events: Schema.Array(ProjectEventKind),
  headerNames: Schema.Array(Schema.String),
  secretFingerprint: Schema.String,
  status: WebhookStatus,
  disabledReason: Schema.NullOr(Schema.String),
  disabledAt: Schema.NullOr(Schema.DateFromString),
  failureCount: Schema.Finite,
  nextAttemptAt: Schema.DateFromString,
  lastSuccessAt: Schema.NullOr(Schema.DateFromString),
  createdAt: Schema.DateFromString
})
export type Webhook = typeof Webhook.Type

export const WebhookWithSecret = Schema.Struct({
  webhook: Webhook,
  secret: Schema.String
})
export type WebhookWithSecret = typeof WebhookWithSecret.Type

export const WebhookDeliveryState = Schema.Literals([
  "pending",
  "delivered",
  "failed",
  "expired"
])
export type WebhookDeliveryState = typeof WebhookDeliveryState.Type

export const WebhookDelivery = Schema.Struct({
  id: WebhookDeliveryId,
  event: Schema.String,
  kind: Schema.Literals(["event", "test"]),
  state: WebhookDeliveryState,
  attempts: Schema.Finite,
  lastAttemptAt: Schema.NullOr(Schema.DateFromString),
  lastStatusCode: Schema.NullOr(Schema.Finite),
  lastOutcome: Schema.NullOr(Schema.String),
  responseExcerpt: Schema.NullOr(Schema.String),
  createdAt: Schema.DateFromString,
  finishedAt: Schema.NullOr(Schema.DateFromString)
})
export type WebhookDelivery = typeof WebhookDelivery.Type
