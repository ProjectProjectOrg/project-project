import { ToolFailure } from "@pp/shared"
import { HttpServerResponse } from "effect/http"

import { AuthRejection, callerAuthMiddleware } from "../auth/CallerAuth"
import { toolsResource } from "../auth/config"

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

export const ToolsAuthMiddlewareLive = callerAuthMiddleware(
  toolsResource,
  respond
)
