import { ToolFailure } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpServerResponse } from "effect/http"
import * as Layer from "effect/Layer"

import { AuthRejection, callerAuthMiddleware } from "../auth/CallerAuth"
import { AuthInstance } from "../auth/config"

const signInAgain =
  "You're not signed in, or your sign-in expired or was revoked. Run `pp login` and try again."

const respond = AuthRejection.$match({
  banned: () =>
    HttpServerResponse.jsonUnsafe(
      new ToolFailure({
        error: "Forbidden",
        message: "This account is suspended."
      }),
      { status: 403 }
    ),
  unauthorized: ({ status, wwwAuthenticate }) =>
    HttpServerResponse.jsonUnsafe(
      new ToolFailure({ error: "Unauthorized", message: signInAgain }),
      { status, headers: { "www-authenticate": wwwAuthenticate } }
    )
})

export const ToolsAuthMiddlewareLive = Layer.unwrap(
  Effect.map(AuthInstance, ({ toolsResource }) =>
    callerAuthMiddleware(toolsResource, respond)
  )
)
