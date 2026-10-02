import { createResourceServerChallenge } from "@better-auth/oauth-provider"
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
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
  Headers as HttpHeaders,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse
} from "effect/unstable/http"

import { auth, mcpResource } from "../auth"
import { McpRequestUser } from "../mcp/McpRequestUser"

class TokenRejected extends Data.TaggedError("TokenRejected")<{
  readonly cause: unknown
}> {}

class InvalidAccessToken extends Data.TaggedError("InvalidAccessToken")<{}> {}

class ConsentRevoked extends Data.TaggedError("ConsentRevoked")<{}> {}

class UserBanned extends Data.TaggedError("UserBanned")<{}> {}

const AccessTokenClaims = Schema.Struct({
  sub: Schema.String,
  client_id: Schema.String,
  pp_consent_ids: Schema.NonEmptyArray(Schema.String)
})

const decodeClaims = Schema.decodeUnknownEffect(AccessTokenClaims)

const resourceMetadataUrl = new URL(
  "/.well-known/oauth-protected-resource/mcp",
  mcpResource
).href

const jsonRpcError = (
  message: string,
  status: number,
  headers?: HttpHeaders.Input
) =>
  HttpServerResponse.jsonUnsafe(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null
    },
    { status, headers }
  )

const unauthorized = jsonRpcError("Unauthorized", 401, {
  "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`
})

const challenge = (cause: unknown) => {
  const apiError = createResourceServerChallenge(cause, mcpResource)
  if (!apiError) {
    return Effect.logError("mcp access token verification failed", cause).pipe(
      Effect.andThen(Effect.die(cause))
    )
  }
  return Effect.succeed(
    jsonRpcError(
      apiError.message,
      apiError.statusCode,
      HttpHeaders.fromInput(new Headers(apiError.headers))
    )
  )
}

export const McpAuthMiddlewareLive = HttpRouter.middleware(
  Effect.gen(function* () {
    const db = yield* Db
    const users = yield* Users
    const { baseURL, internalAdapter } = yield* Effect.promise(
      () => auth.$context
    )
    if (!baseURL) {
      return yield* Effect.die("BETTER_AUTH_URL is required for MCP auth")
    }
    const replayStore = createDpopReplayStore(internalAdapter)

    const verify = Effect.fn("McpAuth.verify")(function* (
      request: HttpServerRequest.HttpServerRequest
    ) {
      return yield* Effect.tryPromise({
        try: () =>
          verifyAccessTokenRequest(
            {
              authorizationHeader: request.headers["authorization"],
              dpopProofJwt: request.headers["dpop"],
              method: request.method,
              url: mcpResource
            },
            {
              verifyOptions: { issuer: baseURL, audience: mcpResource },
              jwksUrl: `${baseURL}/jwks`,
              dpop: { replayStore }
            }
          ),
        catch: (cause) => new TokenRejected({ cause })
      })
    })

    const resolveUser = Effect.fn("McpAuth.resolveUser")(function* (
      claims: unknown
    ) {
      const decoded = yield* decodeClaims(claims).pipe(
        Effect.mapError(() => new InvalidAccessToken())
      )
      const consents = yield* db
        .select({ id: oauthConsent.id })
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
        return yield* Effect.die("MCP token subject is missing from users")
      }
      return found[0]
    })

    return (effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const claims = yield* verify(request)
        const caller = yield* resolveUser(claims)
        return yield* Effect.provideService(
          effect,
          McpRequestUser,
          Option.some(caller)
        )
      }).pipe(
        Effect.catchTags({
          TokenRejected: (e) => challenge(e.cause),
          InvalidAccessToken: () => Effect.succeed(unauthorized),
          ConsentRevoked: () => Effect.succeed(unauthorized),
          UserBanned: () => Effect.succeed(jsonRpcError("Forbidden", 403))
        })
      )
  })
).layer
