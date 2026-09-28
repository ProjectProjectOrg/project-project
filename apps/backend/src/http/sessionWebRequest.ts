import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import { Unauthorized } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpServerRequest } from "effect/unstable/http"

import { toWebHeaders } from "./toWebHeaders"

export const sessionWebRequest = Effect.gen(function* () {
  const req = yield* HttpServerRequest.HttpServerRequest
  const ba = yield* BetterAuth
  const session = yield* ba
    .getSession(toWebHeaders(req.headers))
    .pipe(Effect.mapError(() => new Unauthorized()))
  if (session === null) {
    return yield* new Unauthorized()
  }
  return yield* HttpServerRequest.toWeb(req).pipe(Effect.orDie)
})
