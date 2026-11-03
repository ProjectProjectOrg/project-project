import { Db } from "@pp/db"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"

import * as Client from "./Client"
import * as TimeTracking from "./TimeTracking"

export type EverhourWebhookDelivery = Readonly<{
  secret: string
  body: string
}>

export class EverhourWebhooks extends Context.Service<
  EverhourWebhooks,
  Readonly<{
    handle: (delivery: EverhourWebhookDelivery) => Effect.Effect<void>
  }>
>()("@pp/integration-everhour/Webhooks/EverhourWebhooks") {}

const wrapped = <K extends string>(key: K) =>
  Schema.Struct({ [key]: Client.TimeRecordResponse }).pipe(
    Schema.decodeTo(
      Schema.toType(Client.TimeRecordResponse),
      SchemaTransformation.transform({
        decode: (input) => input[key],
        encode: (input) => ({ [key]: input })
      })
    )
  )

const PayloadData = Schema.Struct({
  payload: Schema.Struct({ data: Client.TimeRecordResponse })
}).pipe(
  Schema.decodeTo(
    Schema.toType(Client.TimeRecordResponse),
    SchemaTransformation.transform({
      decode: (input) => input.payload.data,
      encode: (input) => ({ payload: { data: input } })
    })
  )
)

const WebhookTimeRecord = Schema.fromJsonString(
  Schema.Union([
    Client.TimeRecordResponse,
    wrapped("data"),
    wrapped("time"),
    wrapped("timeRecord"),
    wrapped("payload"),
    PayloadData
  ])
)
const decodeWebhookTimeRecord = Schema.decodeOption(WebhookTimeRecord)

export const parseTimeRecord = (
  body: string
): Client.EverhourTimeRecord | null => {
  const decoded = decodeWebhookTimeRecord(body)
  if (Option.isNone(decoded)) return null
  return Client.toTimeRecord(decoded.value)
}

const make = Effect.gen(function* () {
  const db = yield* Db
  const timeTracking = yield* TimeTracking.EverhourTimeTracking

  const handle = Effect.fn("EverhourWebhooks.handle")(function* ({
    secret,
    body
  }: EverhourWebhookDelivery) {
    const integration = yield* db.query.projectEverhourIntegration
      .findFirst({
        columns: { projectIntegrationLinkId: true },
        where: {
          RAW: (table, _operators) => _operators.eq(table.webhookSecret, secret)
        }
      })
      .pipe(Effect.orDie)
    if (!integration) return
    const record = parseTimeRecord(body)
    if (!record) return
    yield* timeTracking.applyWebhookTimeEvent(
      integration.projectIntegrationLinkId,
      record
    )
  }, Effect.ignore())

  return EverhourWebhooks.of({ handle })
})

export const layer = Layer.effect(EverhourWebhooks, make)
