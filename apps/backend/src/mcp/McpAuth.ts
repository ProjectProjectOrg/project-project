import { type Headers as HttpHeaders, HttpServerResponse } from "effect/http"

import { AuthRejection, callerAuthMiddleware } from "../auth/CallerAuth"
import { mcpResource } from "../auth/config"

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

const respond = AuthRejection.$match({
  banned: () => jsonRpcError("Forbidden", 403),
  unauthorized: ({ message, status, wwwAuthenticate }) =>
    jsonRpcError(message, status, { "www-authenticate": wwwAuthenticate })
})

export const McpAuthMiddlewareLive = callerAuthMiddleware(mcpResource, respond)
