import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import { Db } from "../Services/Db"
import type { EverhourTimeRecord } from "../Services/Everhour"
import { EverhourTimeTracking } from "../Services/EverhourTimeTracking"
import {
  EverhourWebhooks,
  type EverhourWebhooksShape
} from "../Services/EverhourWebhooks"

const ExternalId = Schema.Union([Schema.String, Schema.Finite])
const TimeRecordPayload = Schema.Struct({
  id: ExternalId,
  time: Schema.Finite,
  task: Schema.NullOr(Schema.Struct({ id: ExternalId })).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  user: Schema.NullOr(ExternalId).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  ),
  date: Schema.String.pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(""))
  ),
  comment: Schema.NullOr(Schema.String).pipe(
    Schema.withDecodingDefaultTypeKey(Effect.succeed(null))
  )
})

const wrapped = <K extends string>(key: K) =>
  Schema.Struct({ [key]: TimeRecordPayload }).pipe(
    Schema.decodeTo(
      Schema.toType(TimeRecordPayload),
      SchemaTransformation.transform({
        decode: (input) => input[key],
        encode: (input) => ({ [key]: input })
      })
    )
  )

const PayloadData = Schema.Struct({
  payload: Schema.Struct({ data: TimeRecordPayload })
}).pipe(
  Schema.decodeTo(
    Schema.toType(TimeRecordPayload),
    SchemaTransformation.transform({
      decode: (input) => input.payload.data,
      encode: (input) => ({ payload: { data: input } })
    })
  )
)

const WebhookTimeRecord = Schema.fromJsonString(
  Schema.Union([
    TimeRecordPayload,
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
  const record = decoded.value
  return {
    id: String(record.id),
    taskId: record.task === null ? null : String(record.task.id),
    userId: record.user === null ? null : String(record.user),
    seconds: record.time,
    date: record.date,
    comment: record.comment
  }
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
                _operators.eq(table.webhookSecret, secret)!
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
