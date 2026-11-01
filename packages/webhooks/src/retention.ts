import type { Db } from "@pp/db"
import { webhookDelivery } from "@pp/db/schema"
import { sql } from "drizzle-orm"
import * as Effect from "effect/Effect"

export const keepDeliveries = { event: 50, test: 10, expired: 20 } as const

export const trimHistory = (db: Db["Service"], endpointId: string) =>
  db
    .execute(
      sql`delete from ${webhookDelivery} where ${webhookDelivery.id} in (
        select id from (
          select id, bucket, row_number() over (
            partition by bucket order by created_at desc, id desc
          ) as position
          from (
            select id, created_at,
              case when state = 'expired' then 'expired' else kind end as bucket
            from ${webhookDelivery}
            where endpoint_id = ${endpointId} and state <> 'pending'
          ) finished
        ) ranked
        where (bucket = 'event' and position > ${keepDeliveries.event})
          or (bucket = 'test' and position > ${keepDeliveries.test})
          or (bucket = 'expired' and position > ${keepDeliveries.expired})
      )`,
      "objects"
    )
    .pipe(Effect.asVoid)
