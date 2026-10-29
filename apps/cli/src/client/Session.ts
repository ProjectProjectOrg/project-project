import { cliOAuthClient } from "@pp/shared"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

import { refreshTokens } from "../auth/tokens"
import { type SavedServer, ServerStore } from "../servers/ServerStore"

const REFRESH_BEFORE_MS = 60_000

export const resourceFor = (origin: string) =>
  `${origin}${cliOAuthClient.resourcePath}`

export const freshAccessToken = Effect.fn("freshAccessToken")(function* (
  server: SavedServer
) {
  const now = yield* Clock.currentTimeMillis
  if (server.tokens.expiresAt - now > REFRESH_BEFORE_MS) {
    return server.tokens.accessToken
  }
  const tokens = yield* refreshTokens({
    tokenEndpoint: server.endpoints.token,
    refreshToken: server.tokens.refreshToken,
    resource: resourceFor(server.origin)
  })
  yield* (yield* ServerStore).save({ ...server, tokens })
  return tokens.accessToken
})
