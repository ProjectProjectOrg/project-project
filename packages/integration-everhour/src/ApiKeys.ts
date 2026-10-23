import { Db } from "@pp/db"
import { EverhourApiKeyMissing, type EverhourConfigMissing } from "@pp/shared"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import { EverhourHost } from "./Host"

export class EverhourApiKeys extends Context.Service<
  EverhourApiKeys,
  Readonly<{
    forUser: (
      userId: string
    ) => Effect.Effect<
      Readonly<{ apiKey: string; everhourUserId: string }>,
      EverhourApiKeyMissing | EverhourConfigMissing
    >
  }>
>()("@pp/integration-everhour/ApiKeys/EverhourApiKeys") {
  static readonly layer = Layer.effect(
    EverhourApiKeys,
    Effect.gen(function* () {
      const db = yield* Db
      const host = yield* EverhourHost
      const forUser = Effect.fn("Everhour.apiKeyForUser")(function* (
        userId: string
      ) {
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
      return EverhourApiKeys.of({ forUser })
    })
  )
}
