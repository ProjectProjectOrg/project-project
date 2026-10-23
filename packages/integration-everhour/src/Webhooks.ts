import { Db } from "@pp/db"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"

import {
  TimeRecordResponse,
  toTimeRecord,
  type EverhourTimeRecord
} from "./Client"
import { EverhourTimeTracking } from "./TimeTracking"

export interface EverhourWebhookDelivery {
  readonly secret: string
  readonly body: string
}

export interface EverhourWebhooksShape {
  readonly handle: (delivery: EverhourWebhookDelivery) => Effect.Effect<void>
}

export class EverhourWebhooks extends Context.Service<
  EverhourWebhooks,
  EverhourWebhooksShape
>()("@pp/integration-everhour/Webhooks/EverhourWebhooks") {}

const wrapped = <K extends string>(key: K) =>
  Schema.Struct({ [key]: TimeRecordResponse }).pipe(
    Schema.decodeTo(
      Schema.toType(TimeRecordResponse),
      SchemaTransformation.transform({
        decode: (input) => input[key],
        encode: (input) => ({ [key]: input })
      })
    )
  )

const PayloadData = Schema.Struct({
  payload: Schema.Struct({ data: TimeRecordResponse })
}).pipe(
  Schema.decodeTo(
    Schema.toType(TimeRecordResponse),
    SchemaTransformation.transform({
      decode: (input) => input.payload.data,
      encode: (input) => ({ payload: { data: input } })
    })
  )
)

const WebhookTimeRecord = Schema.fromJsonString(
  Schema.Union([
    TimeRecordResponse,
    wrapped("data"),
    wrapped("time"),
    wrapped("timeRecord"),
    wrapped("payload"),
    PayloadData
  ])
)
const decodeWebhookTimeRecord = Schema.decodeOption(WebhookTimeRecord)

export const parseTimeRecord = (body: string): EverhourTimeRecord | null => {
  const decoded = decodeWebhookTimeRecord(body)
  if (Option.isNone(decoded)) return null
  return toTimeRecord(decoded.value)
}

export const EverhourWebhooksLive = Layer.effect(
  EverhourWebhooks,
  Effect.gen(function* () {
    const db = yield* Db
    const timeTracking = yield* EverhourTimeTracking

    const handle: EverhourWebhooksShape["handle"] = ({ secret, body }) =>
      Effect.gen(function* () {
        const integration = yield* db.query.projectEverhourIntegration
          .findFirst({
            columns: { projectIntegrationLinkId: true },
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.webhookSecret, secret)
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
      }).pipe(Effect.ignore)

    return { handle } satisfies EverhourWebhooksShape
  })
)
