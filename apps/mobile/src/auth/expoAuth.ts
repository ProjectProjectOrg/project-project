import * as Effect from "effect/Effect"
import * as Encoding from "effect/Encoding"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Crypto from "expo-crypto"
import * as WebBrowser from "expo-web-browser"

import { appRedirectUri } from "./oauth"
import { AuthBrowser, PkceSource } from "./ports"

const randomToken = (bytes: number) =>
  Encoding.encodeBase64Url(Crypto.getRandomBytes(bytes))

export const ExpoAuthLive = Layer.mergeAll(
  Layer.succeed(AuthBrowser, {
    authorize: (url) =>
      Effect.promise(() =>
        WebBrowser.openAuthSessionAsync(url, appRedirectUri)
      ).pipe(
        Effect.map((result) =>
          result.type === "success" ? Option.some(result.url) : Option.none()
        )
      )
  }),
  Layer.succeed(PkceSource, {
    create: Effect.promise(async () => {
      const verifier = randomToken(32)
      const digest = await Crypto.digest(
        Crypto.CryptoDigestAlgorithm.SHA256,
        new TextEncoder().encode(verifier)
      )
      return {
        verifier,
        challenge: Encoding.encodeBase64Url(new Uint8Array(digest)),
        state: randomToken(16)
      }
    })
  })
)
