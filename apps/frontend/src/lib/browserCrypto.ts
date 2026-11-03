import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"

export const browserCrypto: Crypto.Crypto = Crypto.make({
  randomBytes: (size) =>
    globalThis.crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) =>
    Effect.promise(() =>
      globalThis.crypto.subtle.digest(algorithm, new Uint8Array(data))
    ).pipe(Effect.map((buffer) => new Uint8Array(buffer)))
})
