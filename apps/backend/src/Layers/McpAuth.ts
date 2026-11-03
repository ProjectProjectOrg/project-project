import { type Headers as HttpHeaders, HttpServerResponse } from "effect/http"

import { mcpResource } from "../auth"
import { type AuthRejection, callerAuthMiddleware } from "./CallerAuth"

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

const respond = (rejection: AuthRejection) =>
  rejection.kind === "banned"
    ? jsonRpcError("Forbidden", 403)
    : jsonRpcError(rejection.message, rejection.status, {
        "www-authenticate": rejection.wwwAuthenticate
      })

export const McpAuthMiddlewareLive = callerAuthMiddleware(mcpResource, respond)
