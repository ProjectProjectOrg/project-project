import { ToolFailure } from "@pp/shared"
import { HttpServerResponse } from "effect/http"

import { toolsResource } from "../auth"
import { type AuthRejection, callerAuthMiddleware } from "./CallerAuth"

const signInAgain =
  "You're not signed in, or your sign-in expired or was revoked. Run `pp login` and try again."

const respond = (rejection: AuthRejection) =>
  rejection.kind === "banned"
    ? HttpServerResponse.jsonUnsafe(
        new ToolFailure({
          error: "Forbidden",
          message: "This account is suspended."
        }),
        { status: 403 }
      )
    : HttpServerResponse.jsonUnsafe(
        new ToolFailure({ error: "Unauthorized", message: signInAgain }),
        {
          status: rejection.status,
          headers: { "www-authenticate": rejection.wwwAuthenticate }
        }
      )

export const ToolsAuthMiddlewareLive = callerAuthMiddleware(
  toolsResource,
  respond
)
