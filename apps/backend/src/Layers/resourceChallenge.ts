import { createResourceServerChallenge } from "@better-auth/oauth-provider"
import { DPOP_SIGNING_ALGORITHMS } from "better-auth/oauth2"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"

import { protectedResourceMetadataUrl } from "../auth/protectedResourceMetadata"

export type ResourceChallenge = Readonly<{
  status: number
  message: string
  wwwAuthenticate: string
}>

export const bearerChallenge = (resource: string) =>
  `Bearer resource_metadata="${protectedResourceMetadataUrl(resource)}"`

const invalidDpopProof = (resource: string): ResourceChallenge => ({
  status: 401,
  message: "Invalid DPoP proof",
  wwwAuthenticate: `DPoP error="invalid_dpop_proof", algs="${DPOP_SIGNING_ALGORITHMS.join(" ")}", ${bearerChallenge(resource)}`
})

export const resourceChallenge = (cause: unknown, resource: string) =>
  Effect.try(() => createResourceServerChallenge(cause, resource)).pipe(
    Effect.map((apiError) =>
      Option.map(
        Option.fromNullishOr(apiError),
        (challenge): ResourceChallenge => ({
          status: challenge.statusCode,
          message: challenge.message,
          wwwAuthenticate:
            new Headers(challenge.headers).get("www-authenticate") ??
            bearerChallenge(resource)
        })
      )
    ),
    Effect.catch(() => Effect.succeedSome(invalidDpopProof(resource)))
  )
