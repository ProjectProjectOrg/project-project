import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"

export class WebhookSecretError extends Data.TaggedError("WebhookSecretError")<{
  readonly reason: string
}> {}

export type SealedSecret = Readonly<{
  ciphertext: string
  nonce: string
  tag: string
}>

export class WebhookHost extends Context.Service<
  WebhookHost,
  Readonly<{
    seal: (plaintext: string) => Effect.Effect<SealedSecret, WebhookSecretError>
    open: (sealed: SealedSecret) => Effect.Effect<string, WebhookSecretError>
  }>
>()("@pp/webhooks/Host/WebhookHost") {}
