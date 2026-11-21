// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Result from "effect/Result"

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

const KEY_PROBLEMS = {
  key_missing: "USER_SECRET_ENCRYPTION_KEY is missing",
  key_length: "USER_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key"
}

const loadKey = Config.Redacted("USER_SECRET_ENCRYPTION_KEY").pipe(
  Config.map(Redacted.value),
  Config.withDefault(""),
  Config.map((raw) => {
    if (raw === "") return Result.fail("key_missing" as const)
    const key = Buffer.from(raw, "base64")
    return key.byteLength === 32
      ? Result.succeed(key)
      : Result.fail("key_length" as const)
  })
)

const make = Effect.gen(function* () {
  const loaded = yield* loadKey
  const encryptionKey = Result.match(loaded, {
    onSuccess: Effect.succeed,
    onFailure: (reason) =>
      Effect.logWarning(
        `secret encryption is not configured: ${KEY_PROBLEMS[reason]}`
      ).pipe(Effect.andThen(new SecretCryptoUnavailable({ reason })))
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

  return SecretCrypto.of({ seal, open })
})

export const layer = Layer.effect(SecretCrypto, make)
