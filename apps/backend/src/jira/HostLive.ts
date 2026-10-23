import { serializeCommentsRegion } from "@pp/server-core/comments/comments-region"
import { JiraHost, JiraPublicationFormat } from "@pp/server-core/jira/Host"
import { attachmentObjectKey } from "@pp/server-core/storage/S3Storage"
import { SecretCrypto } from "@pp/server-core/storage/SecretCrypto"
import { JiraError } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export const JiraHostLive = Layer.effect(
  JiraHost,
  Effect.gen(function* () {
    const secrets = yield* SecretCrypto
    return JiraHost.of({
      seal: (plaintext) =>
        secrets
          .seal(plaintext)
          .pipe(
            Effect.mapError(() => new JiraError({ reason: "invalid_response" }))
          ),
      open: (sealed) =>
        secrets
          .open(sealed)
          .pipe(
            Effect.mapError(() => new JiraError({ reason: "invalid_response" }))
          )
    })
  })
)

export const JiraPublicationFormatLive = Layer.succeed(JiraPublicationFormat, {
  serializeCommentsRegion,
  attachmentObjectKey
})
