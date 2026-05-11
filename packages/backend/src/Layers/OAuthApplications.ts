// OAuthApplications — Drizzle-backed implementation. Better Auth's MCP
// plugin doesn't expose a "list user's apps" or "revoke" API, so we go
// straight to the underlying tables it owns (`oauth_application`,
// `oauth_access_token`, `oauth_consent`). The list query joins the access
// tokens to surface `lastUsedAt` as the most recent token issuance.
//
// Note: revoke does three deletes sequentially rather than in a transaction.
// Db is a `PgRemoteDatabase` (proxy), which doesn't expose `.transaction`.
// The deletes are idempotent enough that a partial failure leaves the system
// in a recoverable state — the user can retry the revoke.

import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { and, desc, eq, isNull, max, or } from "drizzle-orm"
import { NotFound, type OAuthApplication } from "@projectproject/shared"
import {
  oauthAccessToken,
  oauthApplication,
  oauthConsent
} from "../db/auth-schema"
import { Db } from "../Services/Db"
import {
  OAuthApplications,
  type OAuthApplicationsShape
} from "../Services/OAuthApplications"

export const OAuthApplicationsLive = Layer.effect(
  OAuthApplications,
  Effect.gen(function* () {
    const db = yield* Db

    const listForUser = (
      userId: string
    ): Effect.Effect<ReadonlyArray<OAuthApplication>> =>
      Effect.gen(function* () {
        const rows = yield* Effect.tryPromise(() =>
          db
            .select({
              id: oauthApplication.id,
              name: oauthApplication.name,
              clientId: oauthApplication.clientId,
              createdAt: oauthApplication.createdAt,
              lastUsedAt: max(oauthAccessToken.createdAt)
            })
            .from(oauthApplication)
            .leftJoin(
              oauthAccessToken,
              and(
                eq(oauthAccessToken.clientId, oauthApplication.clientId),
                eq(oauthAccessToken.userId, oauthApplication.userId)
              )
            )
            .where(
              and(
                eq(oauthApplication.userId, userId),
                or(
                  isNull(oauthApplication.disabled),
                  eq(oauthApplication.disabled, false)
                )
              )
            )
            .groupBy(
              oauthApplication.id,
              oauthApplication.name,
              oauthApplication.clientId,
              oauthApplication.createdAt
            )
            .orderBy(desc(oauthApplication.createdAt))
        ).pipe(Effect.orDie)

        // Filter rows missing createdAt/clientId — Better Auth always
        // populates them on insert; absence means corrupt state we'd rather
        // hide than crash the response on.
        return rows.flatMap((r): ReadonlyArray<OAuthApplication> => {
          if (!r.createdAt || !r.clientId) return []
          return [
            {
              id: r.id,
              name: r.name ?? r.clientId,
              clientId: r.clientId,
              createdAt: r.createdAt,
              lastUsedAt: r.lastUsedAt ?? null
            }
          ]
        })
      })

    const revokeForUser = (
      userId: string,
      applicationId: string
    ): Effect.Effect<void, NotFound> =>
      Effect.gen(function* () {
        const existing = yield* Effect.tryPromise(() =>
          db
            .select({
              id: oauthApplication.id,
              clientId: oauthApplication.clientId
            })
            .from(oauthApplication)
            .where(
              and(
                eq(oauthApplication.id, applicationId),
                eq(oauthApplication.userId, userId)
              )
            )
            .limit(1)
        ).pipe(Effect.orDie)

        const row = existing[0]
        if (!row) return yield* new NotFound()

        const clientId = row.clientId
        if (clientId) {
          yield* Effect.tryPromise(() =>
            db
              .delete(oauthAccessToken)
              .where(
                and(
                  eq(oauthAccessToken.clientId, clientId),
                  eq(oauthAccessToken.userId, userId)
                )
              )
          ).pipe(Effect.orDie)

          yield* Effect.tryPromise(() =>
            db
              .delete(oauthConsent)
              .where(
                and(
                  eq(oauthConsent.clientId, clientId),
                  eq(oauthConsent.userId, userId)
                )
              )
          ).pipe(Effect.orDie)
        }

        yield* Effect.tryPromise(() =>
          db
            .delete(oauthApplication)
            .where(
              and(
                eq(oauthApplication.id, applicationId),
                eq(oauthApplication.userId, userId)
              )
            )
        ).pipe(Effect.orDie)
      })

    return { listForUser, revokeForUser } satisfies OAuthApplicationsShape
  })
)
