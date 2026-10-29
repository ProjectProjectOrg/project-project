import * as Effect from "effect/Effect"
import {
  Headers as HttpHeaders,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse
} from "effect/http"
import * as Option from "effect/Option"

import { mcpResource } from "../auth"
import { ToolCaller } from "../tools/ToolCaller"
import { bearerVerifier } from "./BearerAuth"
import { bearerChallenge, resourceChallenge } from "./resourceChallenge"

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
  "www-authenticate": bearerChallenge(mcpResource)
})

const challenge = (cause: unknown) =>
  Effect.flatMap(
    resourceChallenge(cause, mcpResource),
    Option.match({
      onNone: () =>
        Effect.logError("mcp access token verification failed", cause).pipe(
          Effect.andThen(Effect.die(cause))
        ),
      onSome: (found) =>
        Effect.succeed(
          jsonRpcError(found.message, found.status, {
            "www-authenticate": found.wwwAuthenticate
          })
        )
    })
  )

export const McpAuthMiddlewareLive = HttpRouter.middleware(
  Effect.gen(function* () {
    const authenticate = yield* bearerVerifier(mcpResource)
    return (effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const caller = yield* authenticate(request)
        return yield* effect.pipe(
          Effect.provideService(ToolCaller, Option.some(caller))
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
