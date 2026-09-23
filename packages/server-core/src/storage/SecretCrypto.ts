import * as Context from "effect/Context"
import * as Data from "effect/Data"
import type * as Effect from "effect/Effect"

export class SecretCryptoUnavailable extends Data.TaggedError(
  "SecretCryptoUnavailable"
)<{ readonly reason: string }> {}

export type SealedSecret = Readonly<{
  ciphertext: string
  nonce: string
  tag: string
}>

export type SecretCryptoShape = Readonly<{
  seal: (
    plaintext: string
  ) => Effect.Effect<SealedSecret, SecretCryptoUnavailable>
  open: (sealed: SealedSecret) => Effect.Effect<string, SecretCryptoUnavailable>
}>

export class SecretCrypto extends Context.Service<
  SecretCrypto,
  SecretCryptoShape
>()("@pp/server-core/storage/SecretCrypto") {}
