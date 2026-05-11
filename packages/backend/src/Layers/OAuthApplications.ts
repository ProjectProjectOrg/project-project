// OAuthApplications — Drizzle-backed implementation.
//
// Better Auth's MCP plugin doesn't expose a "list user's apps" or "revoke"
// API, so we query the underlying tables it owns directly. The user→client
// linkage lives ONLY in `oauth_access_token` — `oauth_application.user_id`
// is always null (DCR happens before any user is involved) and the
// `oauth_consent` table isn't populated by Better Auth v1.6.10. So the list
// query joins applications to access tokens and filters by token.user_id;
// `lastUsedAt` falls out as the most recent token issuance.
//
// Revoke wipes access tokens + consent records for (user, client). We
// deliberately do NOT delete the oauth_application row — applications are
// shared across users by design (DCR registers a client, multiple users may
// authorize it). Deleting one user's tokens removes their grant; the client
// row stays.

import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { and, desc, eq, max } from "drizzle-orm"
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
            .from(oauthAccessToken)
            .innerJoin(
              oauthApplication,
              eq(oauthAccessToken.clientId, oauthApplication.clientId)
            )
            .where(eq(oauthAccessToken.userId, userId))
            .groupBy(
              oauthApplication.id,
              oauthApplication.name,
              oauthApplication.clientId,
              oauthApplication.createdAt
            )
            .orderBy(desc(max(oauthAccessToken.createdAt)))
        ).pipe(Effect.orDie)

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
        // The user is allowed to revoke an application iff they hold at
        // least one access token against it. Verify via the join, then
        // delete tokens + consents scoped to (this user, this client).
        const existing = yield* Effect.tryPromise(() =>
          db
            .select({ clientId: oauthApplication.clientId })
            .from(oauthApplication)
            .innerJoin(
              oauthAccessToken,
              eq(oauthAccessToken.clientId, oauthApplication.clientId)
            )
            .where(
              and(
                eq(oauthApplication.id, applicationId),
                eq(oauthAccessToken.userId, userId)
              )
            )
            .limit(1)
        ).pipe(Effect.orDie)

        const row = existing[0]
        if (!row || !row.clientId) return yield* new NotFound()
        const clientId = row.clientId

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
      })

    return { listForUser, revokeForUser } satisfies OAuthApplicationsShape
  })
)
