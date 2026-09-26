import { Db } from "@pp/db"
import { oauthConsent } from "@pp/db/auth-schema"
import {
  createDpopReplayStore,
  verifyAccessTokenRequest
} from "better-auth/oauth2"
import { and, eq, inArray } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import type { HttpServerRequest } from "effect/unstable/http"

import { auth } from "../auth"

export class TokenRejected extends Data.TaggedError("TokenRejected")<{
  readonly cause: unknown
}> {}

export class InvalidAccessToken extends Data.TaggedError(
  "InvalidAccessToken"
)<{}> {}

export class ConsentRevoked extends Data.TaggedError("ConsentRevoked")<{}> {}

const AccessTokenClaims = Schema.Struct({
  sub: Schema.String,
  client_id: Schema.String,
  pp_consent_ids: Schema.NonEmptyArray(Schema.String)
})

const decodeClaims = Schema.decodeUnknownEffect(AccessTokenClaims)

export class OAuthAccessTokens extends Context.Service<
  OAuthAccessTokens,
  Readonly<{
    verify: (
      request: HttpServerRequest.HttpServerRequest,
      resource: string
    ) => Effect.Effect<unknown, TokenRejected>
    consentedSubject: (
      claims: unknown
    ) => Effect.Effect<string, InvalidAccessToken | ConsentRevoked>
  }>
>()("@pp/backend/Layers/OAuthAccessTokens") {}

export const OAuthAccessTokensLive = Layer.effect(
  OAuthAccessTokens,
  Effect.gen(function* () {
    const db = yield* Db
    const { baseURL, internalAdapter } = yield* Effect.promise(
      () => auth.$context
    )
    if (!baseURL) {
      return yield* Effect.die("BETTER_AUTH_URL is required for OAuth tokens")
    }
    const replayStore = createDpopReplayStore(internalAdapter)

    const verify = Effect.fn("OAuthAccessTokens.verify")(function* (
      request: HttpServerRequest.HttpServerRequest,
      resource: string
    ) {
      return yield* Effect.tryPromise({
        try: () =>
          verifyAccessTokenRequest(
            {
              authorizationHeader: request.headers["authorization"],
              dpopProofJwt: request.headers["dpop"],
              method: request.method,
              url: resource
            },
            {
              verifyOptions: { issuer: baseURL, audience: resource },
              jwksUrl: `${baseURL}/jwks`,
              dpop: { replayStore }
            }
          ),
        catch: (cause) => new TokenRejected({ cause })
      })
    })

    const consentedSubject = Effect.fn("OAuthAccessTokens.consentedSubject")(
      function* (claims: unknown) {
        const decoded = yield* decodeClaims(claims).pipe(
          Effect.mapError(() => new InvalidAccessToken())
        )
        const consents = yield* db
          .select({ id: oauthConsent.id })
          .from(oauthConsent)
          .where(
            and(
              eq(oauthConsent.userId, decoded.sub),
              eq(oauthConsent.clientId, decoded.client_id),
              inArray(oauthConsent.id, decoded.pp_consent_ids)
            )
          )
          .limit(1)
          .pipe(Effect.orDie)
        if (consents.length === 0) {
          return yield* new ConsentRevoked()
        }
        return decoded.sub
      }
    )

    return OAuthAccessTokens.of({ verify, consentedSubject })
  })
)
