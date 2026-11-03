// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

export class SecretCryptoUnavailable extends Data.TaggedError(
  "SecretCryptoUnavailable"
)<{ readonly reason: string }> {}

export type SealedSecret = Readonly<{
  ciphertext: string
  nonce: string
  tag: string
}>

export class SecretCrypto extends Context.Service<
  SecretCrypto,
  Readonly<{
    seal: (
      plaintext: string
    ) => Effect.Effect<SealedSecret, SecretCryptoUnavailable>
    open: (
      sealed: SealedSecret
    ) => Effect.Effect<string, SecretCryptoUnavailable>
  }>
>()("@pp/server-core/storage/SecretCrypto") {}

const encryptionKey = Effect.suspend(() => {
  const raw = process.env.USER_SECRET_ENCRYPTION_KEY
  if (!raw) {
    return Effect.andThen(
      Effect.logWarning(
        "secret encryption is not configured: USER_SECRET_ENCRYPTION_KEY is missing"
      ),
      new SecretCryptoUnavailable({ reason: "key_missing" })
    )
  }
  const key = Buffer.from(raw, "base64")
  if (key.byteLength !== 32) {
    return Effect.andThen(
      Effect.logWarning(
        "secret encryption is not configured: USER_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key"
      ),
      new SecretCryptoUnavailable({ reason: "key_length" })
    )
  }
  return Effect.succeed(key)
})

const seal = Effect.fn("SecretCrypto.seal")(function* (plaintext: string) {
  const key = yield* encryptionKey
  const nonce = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, nonce)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ])
  return {
    ciphertext: encrypted.toString("base64"),
    nonce: nonce.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  } satisfies SealedSecret
})

const open = Effect.fn("SecretCrypto.open")(function* (sealed: SealedSecret) {
  const key = yield* encryptionKey
  return yield* Effect.try({
    try: () => {
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(sealed.nonce, "base64")
      )
      decipher.setAuthTag(Buffer.from(sealed.tag, "base64"))
      return Buffer.concat([
        decipher.update(Buffer.from(sealed.ciphertext, "base64")),
        decipher.final()
      ]).toString("utf8")
    },
    catch: () => new SecretCryptoUnavailable({ reason: "open_failed" })
  })
})

export const layer = Layer.succeed(
  SecretCrypto,
  SecretCrypto.of({ seal, open })
)
