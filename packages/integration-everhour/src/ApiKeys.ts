import type { Db } from "@pp/db"
import { EverhourApiKeyMissing } from "@pp/shared"
import * as Effect from "effect/Effect"

import type { EverhourHost } from "./Host"

export const makeActorApiKey =
  (db: Db["Service"], host: EverhourHost["Service"]) => (userId: string) =>
    Effect.gen(function* () {
      const row = yield* db.query.userEverhourIntegration
        .findFirst({
          columns: {
            encryptedApiKey: true,
            apiKeyNonce: true,
            apiKeyTag: true,
            everhourUserId: true
          },
          where: {
            RAW: (table, _operators) => _operators.eq(table.userId, userId)
          }
        })
        .pipe(Effect.orDie)
      if (!row) return yield* new EverhourApiKeyMissing()
      const apiKey = yield* host.open({
        ciphertext: row.encryptedApiKey,
        nonce: row.apiKeyNonce,
        tag: row.apiKeyTag
      })
      return { apiKey, everhourUserId: row.everhourUserId }
    })
