// apps/backend/src/handlers/auth.ts
//
// THE `auth` HTTPAPI GROUP — HANDLER LAYER.
// ============================================================================
// One endpoint to implement: `GET /me`. The Authentication middleware (in
// `Layers/Auth.ts`) provides the caller's identity as `CurrentUser`. The
// per-viewer fields (active org, personal GitHub and Everhour connections)
// cost queries that no other endpoint needs, so `BetterAuth.me` resolves
// them here instead of on every request.
//
// WHY HANDLERS ARE THIN
// ----------------------------------------------------------------------------
// `docs/PROJECTPROJECT.md` is explicit about the rule:
//
//   > Handlers stay thin — they're plumbing. All logic is in services.
//
// `/me` stays plumbing: it hands the identity and the session's active org
// to `BetterAuth.me`. When we add `projects` and `tickets` groups, their
// handlers stay this thin too — they call `Projects.list`, `Tickets.create`,
// etc. and return the result. Every interesting decision lives in a service
// or in a middleware.
//
// If a handler ever feels like it's accumulating logic, that's the signal to
// push it into a service.

import * as BetterAuth from "@pp/server-core/auth/BetterAuth"
import { AppApi, CurrentUser } from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpServerRequest } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"

import { toWebHeaders } from "../http/toWebHeaders"

export const AuthHandlerLive = HttpApiBuilder.group(
  AppApi,
  "auth",
  (handlers) =>
    Effect.gen(function* () {
      const ba = yield* BetterAuth.BetterAuth
      return handlers.handle("me", () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser
          const request = yield* HttpServerRequest.HttpServerRequest
          const session = yield* ba.getSession(toWebHeaders(request.headers))
          return yield* ba.me(user, session?.session.activeOrganizationId)
        }).pipe(Effect.orDie)
      )
    })
)
