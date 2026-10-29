import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Base64Url from "effect/encoding/Base64Url"

export type Pkce = Readonly<{
  verifier: string
  challenge: string
  state: string
}>

const encoder = new TextEncoder()

export const challengeFor = Effect.fn("challengeFor")(function* (
  verifier: string
) {
  const crypto = yield* Crypto.Crypto
  const hash = yield* crypto.digest("SHA-256", encoder.encode(verifier))
  return Base64Url.encode(hash)
})

export const newPkce = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto
  const verifier = Base64Url.encode(yield* crypto.randomBytes(32))
  const state = Base64Url.encode(yield* crypto.randomBytes(16))
  const pkce: Pkce = {
    verifier,
    challenge: yield* challengeFor(verifier),
    state
  }
  return pkce
})
