import { ToolFailure } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"
import * as Option from "effect/Option"

import { toolsResource } from "../auth"
import { ToolCaller } from "../tools/ToolCaller"
import { bearerVerifier } from "./BearerAuth"
import { bearerChallenge, resourceChallenge } from "./resourceChallenge"

const signInAgain =
  "You're not signed in, or your sign-in expired or was revoked. Run `pp login` and try again."

const failure = (
  status: number,
  error: string,
  message: string,
  wwwAuthenticate?: string
) =>
  HttpServerResponse.jsonUnsafe(new ToolFailure({ error, message }), {
    status,
    headers:
      wwwAuthenticate === undefined
        ? undefined
        : { "www-authenticate": wwwAuthenticate }
  })

const unauthorized = failure(
  401,
  "Unauthorized",
  signInAgain,
  bearerChallenge(toolsResource)
)

const rejected = (cause: unknown) =>
  Effect.flatMap(
    resourceChallenge(cause, toolsResource),
    Option.match({
      onNone: () =>
        Effect.logError("tools access token verification failed", cause).pipe(
          Effect.andThen(Effect.die(cause))
        ),
      onSome: (found) =>
        Effect.succeed(
          failure(
            found.status,
            "Unauthorized",
            signInAgain,
            found.wwwAuthenticate
          )
        )
    })
  )

export const ToolsAuthMiddlewareLive = HttpRouter.middleware(
  Effect.gen(function* () {
    const authenticate = yield* bearerVerifier(toolsResource)
    return (effect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const caller = yield* authenticate(request)
        return yield* effect.pipe(
          Effect.provideService(ToolCaller, Option.some(caller))
        )
      }).pipe(
        Effect.catchTags({
          TokenRejected: (e) => rejected(e.cause),
          InvalidAccessToken: () => Effect.succeed(unauthorized),
          ConsentRevoked: () => Effect.succeed(unauthorized),
          UserBanned: () =>
            Effect.succeed(
              failure(403, "Forbidden", "This account is suspended.")
            )
        })
      )
  })
).layer
