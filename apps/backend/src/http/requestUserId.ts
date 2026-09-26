import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { HttpServerRequest } from "effect/unstable/http"

import { apiResource } from "../auth"
import { OAuthAccessTokens } from "../Layers/OAuthAccessTokens"
import { toWebHeaders } from "./toWebHeaders"

export const requestUserId = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const ba = yield* BetterAuth
  const session = yield* ba
    .getSession(toWebHeaders(req.headers))
    .pipe(Effect.orElseSucceed(() => null))
  if (session !== null) return Option.some(session.user.id)
  const tokens = yield* OAuthAccessTokens
  return yield* tokens
    .verify(req, apiResource)
    .pipe(Effect.flatMap(tokens.consentedSubject), Effect.option)
})
