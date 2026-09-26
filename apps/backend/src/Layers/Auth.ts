// apps/backend/src/Layers/Auth.ts
//
// THE AUTHENTICATION MIDDLEWARE — LIVE IMPLEMENTATION.
// ============================================================================
// The `Authentication` Tag, the `CurrentUser` Tag, and the cookie security
// scheme are all declared in `packages/shared/src/Authentication.ts`. This
// file *implements* the Live Layer — the runtime logic that reads the cookie,
// asks Better Auth who's logged in, and either provides a `User` to the
// handler or fails with `Unauthorized`.
//
// SHAPE OF AN HTTPAPIMIDDLEWARE LIVE LAYER
// ----------------------------------------------------------------------------
// `HttpApiMiddleware.Tag` produces a class that, like any Effect service, you
// implement via `Layer.effect`. The shape is "for each declared security
// scheme, an Effect that returns the `provides` type or fails with the
// `failure` type". Here we have one scheme (`sessionCookie`), so the
// implementation is one method.
//
// The framework parses the cookie according to the `HttpApiSecurity.apiKey`
// declaration and passes its value as the function argument. We don't
// actually use that argument — Better Auth wants the *full* request headers,
// not just the cookie value — but the framework still enforces "cookie must
// be present" as a precondition. Without one, the request short-circuits
// with `Unauthorized` *before* this function runs.
//
// MAPPING THE BOUNDARY ERROR
// ----------------------------------------------------------------------------
// `BetterAuth.getSession` can fail with `BetterAuthError` (e.g. DB blip,
// malformed cookie payload). The wire type of this middleware is
// `Unauthorized`, so we collapse `BetterAuthError → Unauthorized` via
// `Effect.mapError`. The cause is lost from the client's perspective; if you
// want it preserved server-side, log it via `Effect.tapCause(...)` first.
//
// `getSession` also returns `null` when the cookie is structurally valid but
// expired/revoked. That isn't a Promise rejection, just a `null` result — we
// translate it to `Unauthorized` explicitly.
//
// DEPENDENCY DIRECTION
// ----------------------------------------------------------------------------
// `AuthenticationLive` requires `BetterAuth`. `BetterAuthLive` provides it.
// In `main.ts`, both must be reachable from the server layer; the standard
// way is to provide `BetterAuthLive` somewhere underneath `AuthenticationLive`
// in the `Layer.provide` chain.

import { Db } from "@pp/db"
import { member, organization } from "@pp/db/auth-schema"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import {
  Authentication,
  CurrentUser,
  type EditorPreference,
  Unauthorized
} from "@pp/shared"
import { and, asc, eq, isNull } from "drizzle-orm"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { HttpServerRequest } from "effect/unstable/http"

import { apiResource } from "../auth"
import { toWebHeaders } from "../http/toWebHeaders"
import { OAuthAccessTokens } from "./OAuthAccessTokens"

function normalizeEditorPreference(value: unknown): EditorPreference {
  switch (value) {
    case "github_dev":
    case "vscode":
    case "cursor":
      return value
    case "github":
    default:
      return "github"
  }
}

type UserIdentity = Readonly<{
  id: string
  email: string
  name: string
  image?: string | null
  createdAt: Date
  username: string | null | undefined
  editorPreference: string | null | undefined
}>

export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const ba = yield* BetterAuth
    const db = yield* Db
    const tokens = yield* OAuthAccessTokens

    const toCurrentUser = Effect.fn("Authentication.toCurrentUser")(function* (
      user: UserIdentity,
      activeOrganizationId: string | null | undefined
    ) {
      const activeOrgSlug = yield* ba
        .getOrgSlugById(activeOrganizationId)
        .pipe(Effect.orDie)
      const personalGithub = yield* ba
        .getPersonalGithub(user.id)
        .pipe(Effect.orDie)
      const personalEverhour = yield* ba
        .getPersonalEverhour(user.id)
        .pipe(Effect.orDie)
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        username: user.username ?? null,
        image: user.image ?? null,
        createdAt: user.createdAt,
        activeOrgSlug,
        personalGithub,
        editorPreference: normalizeEditorPreference(user.editorPreference),
        personalEverhour
      }
    })

    return Authentication.of({
      sessionCookie: (httpEffect, _options) =>
        Effect.gen(function* () {
          const req = yield* HttpServerRequest.HttpServerRequest
          const session = yield* ba
            .getSession(toWebHeaders(req.headers))
            .pipe(Effect.mapError(() => new Unauthorized()))

          if (session === null) {
            return yield* new Unauthorized()
          }
          const extra = session.user as {
            username?: string | null
            editorPreference?: string | null
          }
          const current = yield* toCurrentUser(
            {
              ...session.user,
              username: extra.username,
              editorPreference: extra.editorPreference
            },
            (session.session as { activeOrganizationId?: string | null })
              .activeOrganizationId
          )
          return yield* Effect.provideService(httpEffect, CurrentUser, current)
        }),
      bearer: (httpEffect, _options) =>
        Effect.gen(function* () {
          const req = yield* HttpServerRequest.HttpServerRequest
          const claims = yield* tokens.verify(req, apiResource)
          const userId = yield* tokens.consentedSubject(claims)
          const row = yield* db.query.user
            .findFirst({
              columns: {
                id: true,
                email: true,
                name: true,
                image: true,
                createdAt: true,
                username: true,
                editorPreference: true,
                lastActiveOrganizationId: true
              },
              where: { id: userId }
            })
            .pipe(Effect.orDie)
          if (!row) {
            return yield* new Unauthorized()
          }
          const memberships = yield* db
            .select({ organizationId: member.organizationId })
            .from(member)
            .innerJoin(organization, eq(member.organizationId, organization.id))
            .where(
              and(eq(member.userId, row.id), isNull(organization.deletedAt))
            )
            .orderBy(asc(member.createdAt))
            .pipe(Effect.orDie)
          const activeOrganizationId =
            memberships.find(
              (membership) =>
                membership.organizationId === row.lastActiveOrganizationId
            )?.organizationId ?? memberships[0]?.organizationId
          const current = yield* toCurrentUser(row, activeOrganizationId)
          return yield* Effect.provideService(httpEffect, CurrentUser, current)
        }).pipe(
          Effect.catchTags({
            TokenRejected: () => Effect.fail(new Unauthorized()),
            InvalidAccessToken: () => Effect.fail(new Unauthorized()),
            ConsentRevoked: () => Effect.fail(new Unauthorized())
          })
        )
    })
  })
)
