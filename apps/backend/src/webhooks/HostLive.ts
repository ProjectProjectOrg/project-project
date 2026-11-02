import { SecretCrypto } from "@pp/server-core/storage/SecretCrypto"
import { WebhookHost, WebhookSecretError } from "@pp/webhooks/Host"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const WebhookHostLive = Layer.effect(
  WebhookHost,
  Effect.gen(function* () {
    const secrets = yield* SecretCrypto
    return WebhookHost.of({
      seal: (plaintext) =>
        secrets
          .seal(plaintext)
          .pipe(
            Effect.mapError(
              (error) => new WebhookSecretError({ reason: error.reason })
            )
          ),
      open: (sealed) =>
        secrets
          .open(sealed)
          .pipe(
            Effect.mapError(
              (error) => new WebhookSecretError({ reason: error.reason })
            )
          )
    })
  })
)
