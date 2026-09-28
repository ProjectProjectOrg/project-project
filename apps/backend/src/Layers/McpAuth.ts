import { createResourceServerChallenge } from "@better-auth/oauth-provider"
import { Users } from "@pp/server-core/users/Users"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import {
  Headers as HttpHeaders,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse
} from "effect/unstable/http"

import { mcpResource } from "../auth"
import { McpRequestUser } from "../mcp/McpRequestUser"
import {
  type OAuthAccessTokenClaims,
  OAuthAccessTokens
} from "./OAuthAccessTokens"

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
    const users = yield* Users
    const tokens = yield* OAuthAccessTokens

    const resolveUser = Effect.fn("McpAuth.resolveUser")(function* (
      claims: OAuthAccessTokenClaims
    ) {
      const userId = yield* tokens.consentedSubject(claims)
      const found = yield* users.fullByIds([userId])
      if (!found[0]) {
        return yield* Effect.die("MCP token subject is missing from users")
      }
      return found[0]
    })

    return (effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const claims = yield* tokens.verify(request, mcpResource)
        const user = yield* resolveUser(claims)
        return yield* Effect.provideService(
          effect,
          McpRequestUser,
          Option.some(user)
        )
      }).pipe(
        Effect.catchTags({
          TokenRejected: (e) => challenge(e.cause),
          InvalidAccessToken: () => Effect.succeed(unauthorized),
          ConsentRevoked: () => Effect.succeed(unauthorized),
          SubjectBanned: () => Effect.succeed(unauthorized)
        })
      )
  })
).layer
