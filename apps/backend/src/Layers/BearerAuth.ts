import { Db } from "@pp/db"
import { oauthClient, oauthConsent, user } from "@pp/db/auth-schema"
import { Users } from "@pp/server-core/users/Users"
import {
  createDpopReplayStore,
  verifyAccessTokenRequest
} from "better-auth/oauth2"
import { and, eq, inArray, isNull, or } from "drizzle-orm"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import type { HttpServerRequest } from "effect/http"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"

import { auth } from "../auth"
import type { ToolCallerShape } from "../tools/ToolCaller"
import { proofUrl } from "./proofUrl"

export class TokenRejected extends Data.TaggedError("TokenRejected")<
  Readonly<{ cause: unknown }>
> {}

export class InvalidAccessToken extends Data.TaggedError(
  "InvalidAccessToken"
)<{}> {}

export class ConsentRevoked extends Data.TaggedError("ConsentRevoked")<{}> {}

export class UserBanned extends Data.TaggedError("UserBanned")<{}> {}

const AccessTokenClaims = Schema.Struct({
  sub: Schema.String,
  client_id: Schema.String,
  pp_consent_ids: Schema.NonEmptyArray(Schema.String)
})

const decodeClaims = Schema.decodeUnknownEffect(AccessTokenClaims)

export const bearerVerifier = (resource: string) =>
  Effect.gen(function* () {
    const db = yield* Db
    const users = yield* Users
    const { baseURL, internalAdapter } = yield* Effect.promise(
      () => auth.$context
    )
    if (!baseURL) {
      return yield* Effect.die("BETTER_AUTH_URL is required for bearer auth")
    }
    const replayStore = createDpopReplayStore(internalAdapter)

    const verify = Effect.fn("BearerAuth.verify")(function* (
      request: HttpServerRequest.HttpServerRequest
    ) {
      return yield* Effect.tryPromise({
        try: () =>
          verifyAccessTokenRequest(
            {
              authorizationHeader: request.headers["authorization"],
              dpopProofJwt: request.headers["dpop"],
              method: request.method,
              url: proofUrl(request.url, resource)
            },
            {
              verifyOptions: { issuer: baseURL, audience: resource },
              jwksUrl: `${baseURL}/jwks`,
              dpop: { replayStore }
            }
          ),
        catch: (cause) => new TokenRejected({ cause })
      }).pipe(
        Effect.flatMap((claims) =>
          decodeClaims(claims).pipe(
            Effect.mapError(() => new InvalidAccessToken())
          )
        )
      )
    })

    const resolveCaller = Effect.fn("BearerAuth.resolveCaller")(function* (
      decoded: typeof AccessTokenClaims.Type
    ) {
      const consents = yield* db
        .select({ id: oauthConsent.id, clientName: oauthClient.name })
        .from(oauthConsent)
        .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
        .where(
          and(
            eq(oauthConsent.userId, decoded.sub),
            eq(oauthConsent.clientId, decoded.client_id),
            inArray(oauthConsent.id, decoded.pp_consent_ids),
            or(isNull(oauthClient.disabled), eq(oauthClient.disabled, false))
          )
        )
        .limit(1)
        .pipe(Effect.orDie)
      if (consents.length === 0) {
        return yield* new ConsentRevoked()
      }
      const [account] = yield* db
        .select({ banned: user.banned, banExpires: user.banExpires })
        .from(user)
        .where(eq(user.id, decoded.sub))
        .limit(1)
        .pipe(Effect.orDie)
      const now = yield* DateTime.nowAsDate
      if (
        account?.banned &&
        (account.banExpires === null || account.banExpires > now)
      ) {
        return yield* new UserBanned()
      }
      const found = yield* users.fullByIds([decoded.sub])
      if (!found[0]) {
        return yield* Effect.die("Token subject is missing from users")
      }
      const caller: ToolCallerShape = {
        user: found[0],
        client: Option.some({
          id: decoded.client_id,
          name: consents[0].clientName ?? decoded.client_id
        })
      }
      return caller
    })

    return (request: HttpServerRequest.HttpServerRequest) =>
      Effect.flatMap(verify(request), resolveCaller)
  })
