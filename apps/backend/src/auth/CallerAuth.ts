import * as Effect from "effect/Effect"
import {
  HttpRouter,
  HttpServerRequest,
  type HttpServerResponse
} from "effect/http"
import * as Option from "effect/Option"

import { ToolCaller } from "../tools/ToolCaller"
import { bearerVerifier } from "./BearerAuth"
import { bearerChallenge, resourceChallenge } from "./resourceChallenge"

export type AuthRejection =
  | Readonly<{
      kind: "unauthorized"
      status: number
      message: string
      wwwAuthenticate: string
    }>
  | Readonly<{ kind: "banned" }>

export const callerAuthMiddleware = (
  resource: string,
  respond: (rejection: AuthRejection) => HttpServerResponse.HttpServerResponse
) => {
  const unauthorized = respond({
    kind: "unauthorized",
    status: 401,
    message: "Unauthorized",
    wwwAuthenticate: bearerChallenge(resource)
  })
  const rejected = (cause: unknown) =>
    Effect.flatMap(
      resourceChallenge(cause, resource),
      Option.match({
        onNone: () =>
          Effect.logError(
            `${resource} access token verification failed`,
            cause
          ).pipe(Effect.andThen(Effect.die(cause))),
        onSome: (found) =>
          Effect.succeed(respond({ kind: "unauthorized", ...found }))
      })
    )
  return HttpRouter.middleware(
    Effect.gen(function* () {
      const authenticate = yield* bearerVerifier(resource)
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
            UserBanned: () => Effect.succeed(respond({ kind: "banned" }))
          })
        )
    })
  ).layer
}
