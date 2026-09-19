import { and, eq, inArray } from "drizzle-orm"
import { createResourceServerChallenge } from "@better-auth/oauth-provider"
import {
  createDpopReplayStore,
  verifyAccessTokenRequest
} from "better-auth/oauth2"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse
} from "effect/unstable/http"
import { auth, mcpResource } from "../auth"
import { oauthConsent } from "../db/auth-schema"
import { McpRequestUser } from "../mcp/McpRequestUser"
import { Db } from "../Services/Db"
import { Users } from "../Services/Users"

class TokenRejected extends Data.TaggedError("TokenRejected")<{
  readonly cause: unknown
}> {}

const ConsentIds = Schema.Array(Schema.String)

const resourceMetadataUrl = new URL(
  "/.well-known/oauth-protected-resource/mcp",
  mcpResource
).href

const unauthorized = HttpServerResponse.jsonUnsafe(
  {
    jsonrpc: "2.0",
    error: { code: -32000, message: "Unauthorized" },
    id: null
  },
  {
    status: 401,
    headers: {
      "www-authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"`
    }
  }
)

const challenge = (cause: unknown) => {
  const apiError = createResourceServerChallenge(cause, mcpResource)
  if (!apiError) return unauthorized
  const headers = Object.fromEntries(new Headers(apiError.headers).entries())
  return HttpServerResponse.jsonUnsafe(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: apiError.message },
      id: null
    },
    { status: apiError.statusCode, headers }
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

    const verify = (request: HttpServerRequest.HttpServerRequest) =>
      Effect.tryPromise({
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

    const resolveUser = (claims: Record<string, unknown>) =>
      Effect.gen(function* () {
        const userId = claims["sub"]
        const clientId = claims["client_id"]
        const consentIds = claims["pp_consent_ids"]
        if (
          typeof userId !== "string" ||
          typeof clientId !== "string" ||
          !Schema.is(ConsentIds)(consentIds) ||
          consentIds.length === 0
        ) {
          return Option.none()
        }
        const consents = yield* db
          .select({ id: oauthConsent.id })
          .from(oauthConsent)
          .where(
            and(
              eq(oauthConsent.userId, userId),
              eq(oauthConsent.clientId, clientId),
              inArray(oauthConsent.id, consentIds)
            )
          )
          .limit(1)
        if (consents.length === 0) return Option.none()
        const found = yield* users.fullByIds([userId])
        return Option.fromUndefinedOr(found[0])
      }).pipe(Effect.orDie)

    return (effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const claims = yield* verify(request)
        const user = yield* resolveUser(claims)
        if (Option.isNone(user)) {
          return yield* new TokenRejected({
            cause: new Error("consent revoked")
          })
        }
        return yield* Effect.provideService(effect, McpRequestUser, user)
      }).pipe(
        Effect.catchTag("TokenRejected", (e) =>
          Effect.succeed(challenge(e.cause))
        )
      )
  })
).layer
