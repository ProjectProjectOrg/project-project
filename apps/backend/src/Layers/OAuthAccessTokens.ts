import { Db } from "@pp/db"
import { oauthConsent, user } from "@pp/db/auth-schema"
import {
  createDpopReplayStore,
  verifyAccessTokenRequest
} from "better-auth/oauth2"
import { and, eq, inArray } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
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

export class SubjectBanned extends Data.TaggedError("SubjectBanned")<{}> {}

const AccessTokenClaims = Schema.Struct({
  sub: Schema.String,
  client_id: Schema.String,
  pp_consent_ids: Schema.NonEmptyArray(Schema.String)
})

export type OAuthAccessTokenClaims = typeof AccessTokenClaims.Type

const decodeClaims = Schema.decodeUnknownEffect(AccessTokenClaims)

export class OAuthAccessTokens extends Context.Service<
  OAuthAccessTokens,
  Readonly<{
    verify: (
      request: HttpServerRequest.HttpServerRequest,
      resource: string
    ) => Effect.Effect<
      OAuthAccessTokenClaims,
      TokenRejected | InvalidAccessToken
    >
    consentedSubject: (
      claims: OAuthAccessTokenClaims
    ) => Effect.Effect<string, ConsentRevoked | SubjectBanned>
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
              url: new URL(
                new URL(request.originalUrl, resource).pathname,
                resource
              ).href
            },
            {
              verifyOptions: { issuer: baseURL, audience: resource },
              jwksUrl: `${baseURL}/jwks`,
              dpop: { replayStore }
            }
          ),
        catch: (cause) => new TokenRejected({ cause })
      }).pipe(
        Effect.flatMap((payload) =>
          decodeClaims(payload).pipe(
            Effect.mapError(() => new InvalidAccessToken())
          )
        )
      )
    })

    const consentedSubject = Effect.fn("OAuthAccessTokens.consentedSubject")(
      function* (decoded: OAuthAccessTokenClaims) {
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
        const subjects = yield* db
          .select({ banned: user.banned, banExpires: user.banExpires })
          .from(user)
          .where(eq(user.id, decoded.sub))
          .limit(1)
          .pipe(Effect.orDie)
        const now = yield* DateTime.now
        const banned =
          subjects[0]?.banned === true &&
          (subjects[0].banExpires === null ||
            DateTime.isGreaterThan(
              DateTime.fromDateUnsafe(subjects[0].banExpires),
              now
            ))
        if (subjects.length === 0 || banned) {
          return yield* new SubjectBanned()
        }
        return decoded.sub
      }
    )

    return OAuthAccessTokens.of({ verify, consentedSubject })
  })
)
