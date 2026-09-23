import { randomBytes } from "node:crypto"

import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { describe, expect } from "vitest"

import { SecretCrypto } from "./SecretCrypto"
import { SecretCryptoLive } from "./SecretCryptoLive"

const withEncryptionKey = <A, E, R>(
  value: string | undefined,
  effect: Effect.Effect<A, E, R>
) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.USER_SECRET_ENCRYPTION_KEY
      if (value === undefined) {
        delete process.env.USER_SECRET_ENCRYPTION_KEY
      } else {
        process.env.USER_SECRET_ENCRYPTION_KEY = value
      }
      return previous
    }),
    () => effect,
    (previous) =>
      Effect.sync(() => {
        if (previous === undefined) {
          delete process.env.USER_SECRET_ENCRYPTION_KEY
        } else {
          process.env.USER_SECRET_ENCRYPTION_KEY = previous
        }
      })
  )

const withRandomKey = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  withEncryptionKey(randomBytes(32).toString("base64"), effect)

describe("SecretCrypto", () => {
  it.effect("round-trips a secret", () =>
    withRandomKey(
      Effect.gen(function* () {
        const crypto = yield* SecretCrypto
        const sealed = yield* crypto.seal("r2-secret-key")
        expect(yield* crypto.open(sealed)).toBe("r2-secret-key")
      }).pipe(Effect.provide(SecretCryptoLive))
    )
  )

  it.effect("produces a different nonce every time", () =>
    withRandomKey(
      Effect.gen(function* () {
        const crypto = yield* SecretCrypto
        const a = yield* crypto.seal("same")
        const b = yield* crypto.seal("same")
        expect(a.nonce).not.toBe(b.nonce)
        expect(a.ciphertext).not.toBe(b.ciphertext)
      }).pipe(Effect.provide(SecretCryptoLive))
    )
  )

  it.effect("fails to open a tampered ciphertext", () =>
    withRandomKey(
      Effect.gen(function* () {
        const crypto = yield* SecretCrypto
        const sealed = yield* crypto.seal("r2-secret-key")
        const result = yield* Effect.result(
          crypto.open({
            ...sealed,
            ciphertext: Buffer.from("tampered").toString("base64")
          })
        )
        expect(result._tag).toBe("Failure")
      }).pipe(Effect.provide(SecretCryptoLive))
    )
  )

  it.effect("fails when the key is absent", () =>
    withEncryptionKey(
      undefined,
      Effect.gen(function* () {
        const crypto = yield* SecretCrypto
        const result = yield* Effect.result(crypto.seal("x"))
        expect(result._tag).toBe("Failure")
      }).pipe(Effect.provide(SecretCryptoLive))
    )
  )

  it.effect("fails when the key is the wrong length", () =>
    withEncryptionKey(
      Buffer.from("short").toString("base64"),
      Effect.gen(function* () {
        const crypto = yield* SecretCrypto
        const result = yield* Effect.result(crypto.seal("x"))
        expect(result._tag).toBe("Failure")
      }).pipe(Effect.provide(SecretCryptoLive))
    )
  )
})
