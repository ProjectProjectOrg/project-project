import { cliOAuthClient } from "@pp/shared"
import * as Clock from "effect/Clock"
import * as Effect from "effect/Effect"

import { refreshTokens } from "../auth/tokens"
import { type SavedServer, ServerStore } from "../servers/ServerStore"

const REFRESH_BEFORE_MS = 60_000

export const resourceFor = (origin: string) =>
  `${origin}${cliOAuthClient.resourcePath}`

const isFresh = (server: SavedServer) =>
  Effect.map(
    Clock.currentTimeMillis,
    (now) => server.tokens.expiresAt - now > REFRESH_BEFORE_MS
  )

const refreshed = (server: SavedServer) =>
  Effect.map(
    refreshTokens({
      tokenEndpoint: server.endpoints.token,
      refreshToken: server.tokens.refreshToken,
      resource: resourceFor(server.origin)
    }),
    (tokens): SavedServer => ({ ...server, tokens })
  )

export const freshAccessToken = Effect.fn("freshAccessToken")(function* (
  given: SavedServer
) {
  if (yield* isFresh(given)) return given.tokens.accessToken
  const store = yield* ServerStore
  const server = yield* store.update(given.origin, (saved) =>
    Effect.flatMap(isFresh(saved), (fresh) =>
      fresh ? Effect.succeed(saved) : refreshed(saved)
    )
  )
  return server.tokens.accessToken
})
