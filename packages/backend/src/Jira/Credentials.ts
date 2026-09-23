import {
  JiraError,
  JiraNotConnected,
  JiraRateLimited,
  JiraReconnectRequired,
  type JiraConnection,
  type JiraReconnectReason
} from "@projectproject/shared"
import { and, eq, gt, isNull, lte, or } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { userJiraIntegration, userJiraOauthState } from "../db/schema"
import { Db } from "../Services/Db"
import { SecretCrypto } from "../Services/SecretCrypto"
import {
  hasRequiredScopes,
  jiraAuthorizeUrl,
  jiraRedirectUri,
  JiraOAuthConfig,
  JiraTokenEndpoint,
  type JiraTokenGrant,
  validateReturnPath
} from "./OAuth"

export interface JiraAccessToken {
  readonly token: Redacted.Redacted<string>
}

export interface JiraCredentialsShape {
  readonly status: (userId: string) => Effect.Effect<JiraConnection>
  readonly beginConnect: (
    userId: string,
    returnPath: string
  ) => Effect.Effect<{ readonly authorizeUrl: string }, JiraError>
  readonly completeConnect: (
    userId: string,
    code: string,
    state: string
  ) => Effect.Effect<JiraConnection, JiraReconnectRequired | JiraError>
  readonly accessTokenFor: (
    userId: string,
    options?: { readonly forceRefresh?: boolean }
  ) => Effect.Effect<
    JiraAccessToken,
    JiraNotConnected | JiraReconnectRequired | JiraRateLimited | JiraError
  >
  readonly disconnect: (userId: string) => Effect.Effect<JiraConnection>
}

interface JiraCredentialsInternalShape extends JiraCredentialsShape {
  readonly returnPathForState: (
    userId: string,
    state: string
  ) => Effect.Effect<string, JiraError>
  readonly completeConnectWithReturnPath: (
    userId: string,
    code: string,
    state: string
  ) => Effect.Effect<
    { readonly connection: JiraConnection; readonly returnPath: string },
    JiraReconnectRequired | JiraError
  >
  readonly markReconnectRequired: (
    userId: string,
    reason: JiraReconnectReason
  ) => Effect.Effect<void>
}

export class JiraCredentials extends Context.Service<
  JiraCredentials,
  JiraCredentialsInternalShape
>()("@projectproject/backend/Jira/Credentials/JiraCredentials") {}

const hashState = (state: string) =>
  createHash("sha256").update(state).digest("hex")

const disconnected = (): JiraConnection => ({
  status: "disconnected",
  reconnectReason: null,
  connectedAt: null
})

const connectionFromRow = (row: {
  readonly status: "active" | "reconnect_required"
  readonly reconnectReason: "invalid_grant" | "missing_scopes" | null
  readonly connectedAt: Date
}): JiraConnection =>
  row.status === "active"
    ? {
        status: "connected",
        reconnectReason: null,
        connectedAt: DateTime.fromDateUnsafe(row.connectedAt)
      }
    : {
        status: "reconnect_required",
        reconnectReason: row.reconnectReason ?? "invalid_grant",
        connectedAt: DateTime.fromDateUnsafe(row.connectedAt)
      }

export const JiraCredentialsLive = Layer.effect(
  JiraCredentials,
  Effect.gen(function* () {
    const db = yield* Db
    const secrets = yield* SecretCrypto
    const oauth = yield* JiraOAuthConfig
    const tokens = yield* JiraTokenEndpoint

    const status = Effect.fn("JiraCredentials.status")(function* (
      userId: string
    ) {
      const row = yield* db.query.userJiraIntegration
        .findFirst({
          where: { userId },
          columns: {
            status: true,
            reconnectReason: true,
            connectedAt: true
          }
        })
        .pipe(Effect.orDie)
      return row ? connectionFromRow(row) : disconnected()
    })

    const beginConnect = Effect.fn("JiraCredentials.beginConnect")(function* (
      userId: string,
      returnPath: string
    ) {
      const safeReturnPath = validateReturnPath(returnPath)
      if (safeReturnPath === null) {
        return yield* new JiraError({ reason: "invalid_response" })
      }
      const state = randomBytes(32).toString("base64url")
      const codeVerifier = randomBytes(32).toString("base64url")
      const now = yield* DateTime.now
      yield* db
        .insert(userJiraOauthState)
        .values({
          userId,
          stateHash: hashState(state),
          codeVerifier,
          returnPath: safeReturnPath,
          expiresAt: DateTime.toDate(DateTime.add(now, { minutes: 10 }))
        })
        .pipe(Effect.mapError(() => new JiraError({ reason: "server_error" })))
      return {
        authorizeUrl: jiraAuthorizeUrl({
          clientId: oauth.clientId,
          redirectUri: jiraRedirectUri(oauth.publicBaseUrl),
          state,
          codeVerifier,
          authorizationEndpoint: oauth.authorizationEndpoint
        })
      }
    })

    const markReconnectRequired = Effect.fn(
      "JiraCredentials.markReconnectRequired"
    )(function* (userId: string, reason: JiraReconnectReason) {
      const now = yield* DateTime.now
      yield* db
        .update(userJiraIntegration)
        .set({
          status: "reconnect_required",
          reconnectReason: reason,
          refreshLeaseId: null,
          refreshLeaseExpiresAt: null,
          updatedAt: DateTime.toDate(now)
        })
        .where(eq(userJiraIntegration.userId, userId))
        .pipe(Effect.orDie)
    })

    const persistGrant = Effect.fn("JiraCredentials.persistGrant")(function* (
      userId: string,
      grant: JiraTokenGrant,
      statusValue: "active" | "reconnect_required",
      reconnectReason: JiraReconnectReason | null
    ) {
      const access = yield* secrets
        .seal(grant.accessToken)
        .pipe(
          Effect.mapError(() => new JiraError({ reason: "invalid_response" }))
        )
      const refresh = yield* secrets
        .seal(grant.refreshToken)
        .pipe(
          Effect.mapError(() => new JiraError({ reason: "invalid_response" }))
        )
      const now = DateTime.toDate(yield* DateTime.now)
      yield* db
        .insert(userJiraIntegration)
        .values({
          userId,
          encryptedAccessToken: access.ciphertext,
          accessTokenNonce: access.nonce,
          accessTokenTag: access.tag,
          encryptedRefreshToken: refresh.ciphertext,
          refreshTokenNonce: refresh.nonce,
          refreshTokenTag: refresh.tag,
          expiresAt: grant.expiresAt,
          grantedScopes: grant.grantedScopes,
          status: statusValue,
          reconnectReason,
          connectedAt: now,
          updatedAt: now,
          refreshLeaseId: null,
          refreshLeaseExpiresAt: null
        })
        .onConflictDoUpdate({
          target: userJiraIntegration.userId,
          set: {
            encryptedAccessToken: access.ciphertext,
            accessTokenNonce: access.nonce,
            accessTokenTag: access.tag,
            encryptedRefreshToken: refresh.ciphertext,
            refreshTokenNonce: refresh.nonce,
            refreshTokenTag: refresh.tag,
            expiresAt: grant.expiresAt,
            grantedScopes: grant.grantedScopes,
            status: statusValue,
            reconnectReason,
            connectedAt: now,
            updatedAt: now,
            refreshLeaseId: null,
            refreshLeaseExpiresAt: null
          }
        })
        .pipe(Effect.mapError(() => new JiraError({ reason: "server_error" })))
    })

    const completeConnectWithReturnPath = Effect.fn(
      "JiraCredentials.completeConnectWithReturnPath"
    )(function* (userId: string, code: string, state: string) {
      const now = yield* DateTime.now
      const consumed = yield* db
        .update(userJiraOauthState)
        .set({ consumedAt: DateTime.toDate(now) })
        .where(
          and(
            eq(userJiraOauthState.stateHash, hashState(state)),
            eq(userJiraOauthState.userId, userId),
            isNull(userJiraOauthState.consumedAt),
            gt(userJiraOauthState.expiresAt, DateTime.toDate(now))
          )
        )
        .returning({
          returnPath: userJiraOauthState.returnPath,
          codeVerifier: userJiraOauthState.codeVerifier
        })
        .pipe(Effect.mapError(() => new JiraError({ reason: "server_error" })))
      const consumedState = consumed[0]
      if (!consumedState) {
        return yield* new JiraError({ reason: "invalid_response" })
      }
      const grant = yield* tokens
        .exchange(code, consumedState.codeVerifier)
        .pipe(
          Effect.catchTag("JiraRateLimited", () =>
            Effect.fail(new JiraError({ reason: "server_error" }))
          ),
          Effect.tapError((error) =>
            error._tag === "JiraReconnectRequired"
              ? markReconnectRequired(userId, error.reason)
              : Effect.void
          )
        )
      if (!hasRequiredScopes(grant.grantedScopes)) {
        yield* persistGrant(
          userId,
          grant,
          "reconnect_required",
          "missing_scopes"
        )
        return yield* new JiraReconnectRequired({ reason: "missing_scopes" })
      }
      yield* persistGrant(userId, grant, "active", null)
      return {
        connection: yield* status(userId),
        returnPath: consumedState.returnPath
      }
    })

    const completeConnect = Effect.fn("JiraCredentials.completeConnect")(
      function* (userId: string, code: string, state: string) {
        const result = yield* completeConnectWithReturnPath(userId, code, state)
        return result.connection
      }
    )

    const returnPathForState = Effect.fn("JiraCredentials.returnPathForState")(
      function* (userId: string, state: string) {
        const now = yield* DateTime.now
        const rows = yield* db
          .select({ returnPath: userJiraOauthState.returnPath })
          .from(userJiraOauthState)
          .where(
            and(
              eq(userJiraOauthState.userId, userId),
              eq(userJiraOauthState.stateHash, hashState(state)),
              isNull(userJiraOauthState.consumedAt),
              gt(userJiraOauthState.expiresAt, DateTime.toDate(now))
            )
          )
          .pipe(
            Effect.mapError(() => new JiraError({ reason: "server_error" }))
          )
        const row = rows[0]
        return row
          ? row.returnPath
          : yield* new JiraError({ reason: "invalid_response" })
      }
    )

    const clearLease = Effect.fn("JiraCredentials.clearLease")(function* (
      userId: string,
      leaseId: string
    ) {
      yield* db
        .update(userJiraIntegration)
        .set({ refreshLeaseId: null, refreshLeaseExpiresAt: null })
        .where(
          and(
            eq(userJiraIntegration.userId, userId),
            eq(userJiraIntegration.refreshLeaseId, leaseId)
          )
        )
        .pipe(Effect.orDie)
    })

    const accessTokenFor = Effect.fn("JiraCredentials.accessTokenFor")(
      function* (
        userId: string,
        options?: { readonly forceRefresh?: boolean }
      ): Effect.fn.Return<
        JiraAccessToken,
        JiraNotConnected | JiraReconnectRequired | JiraRateLimited | JiraError
      > {
        const startedAt = yield* DateTime.now
        const deadline = DateTime.toEpochMillis(startedAt) + 35_000
        let forceRefresh = options?.forceRefresh === true
        let forcedBaselineAccessToken: string | null = null

        while (true) {
          const row = yield* db.query.userJiraIntegration
            .findFirst({ where: { userId } })
            .pipe(Effect.orDie)
          if (!row) return yield* new JiraNotConnected()
          if (row.status === "reconnect_required") {
            return yield* new JiraReconnectRequired({
              reason: row.reconnectReason ?? "invalid_grant"
            })
          }
          if (forceRefresh && forcedBaselineAccessToken === null) {
            forcedBaselineAccessToken = row.encryptedAccessToken
          }
          const now = yield* DateTime.now
          const expiresAfterSkew =
            row.expiresAt.getTime() > DateTime.toEpochMillis(now) + 300_000
          const forcedRefreshCompleted =
            forceRefresh &&
            forcedBaselineAccessToken !== null &&
            row.encryptedAccessToken !== forcedBaselineAccessToken &&
            row.refreshLeaseId === null
          if ((!forceRefresh && expiresAfterSkew) || forcedRefreshCompleted) {
            const opened = yield* secrets
              .open({
                ciphertext: row.encryptedAccessToken,
                nonce: row.accessTokenNonce,
                tag: row.accessTokenTag
              })
              .pipe(
                Effect.mapError(
                  () => new JiraError({ reason: "invalid_response" })
                )
              )
            return { token: Redacted.make(opened) }
          }

          const leaseId = randomUUID()
          const leaseExpiresAt = DateTime.toDate(
            DateTime.add(now, { seconds: 30 })
          )
          const claimed = yield* db
            .update(userJiraIntegration)
            .set({
              refreshLeaseId: leaseId,
              refreshLeaseExpiresAt: leaseExpiresAt
            })
            .where(
              and(
                eq(userJiraIntegration.userId, userId),
                eq(userJiraIntegration.status, "active"),
                or(
                  isNull(userJiraIntegration.refreshLeaseId),
                  lte(
                    userJiraIntegration.refreshLeaseExpiresAt,
                    DateTime.toDate(now)
                  )
                )
              )
            )
            .returning({ userId: userJiraIntegration.userId })
            .pipe(Effect.orDie)

          if (claimed.length === 0) {
            if (DateTime.toEpochMillis(now) >= deadline) {
              return yield* new JiraError({ reason: "refresh_contention" })
            }
            yield* Effect.sleep("100 millis")
            continue
          }

          const refreshToken = yield* secrets
            .open({
              ciphertext: row.encryptedRefreshToken,
              nonce: row.refreshTokenNonce,
              tag: row.refreshTokenTag
            })
            .pipe(
              Effect.mapError(
                () => new JiraError({ reason: "invalid_response" })
              ),
              Effect.tapError(() => clearLease(userId, leaseId))
            )

          const grant = yield* tokens.refresh(refreshToken).pipe(
            Effect.tapError((error) =>
              error._tag === "JiraReconnectRequired"
                ? Effect.gen(function* () {
                    const failedAt = yield* DateTime.now
                    yield* db
                      .update(userJiraIntegration)
                      .set({
                        status: "reconnect_required",
                        reconnectReason: error.reason,
                        refreshLeaseId: null,
                        refreshLeaseExpiresAt: null,
                        updatedAt: DateTime.toDate(failedAt)
                      })
                      .where(
                        and(
                          eq(userJiraIntegration.userId, userId),
                          eq(userJiraIntegration.refreshLeaseId, leaseId)
                        )
                      )
                      .pipe(Effect.orDie)
                  })
                : clearLease(userId, leaseId)
            )
          )
          if (!hasRequiredScopes(grant.grantedScopes)) {
            yield* db
              .update(userJiraIntegration)
              .set({
                status: "reconnect_required",
                reconnectReason: "missing_scopes",
                refreshLeaseId: null,
                refreshLeaseExpiresAt: null,
                updatedAt: DateTime.toDate(now)
              })
              .where(
                and(
                  eq(userJiraIntegration.userId, userId),
                  eq(userJiraIntegration.refreshLeaseId, leaseId)
                )
              )
              .pipe(Effect.orDie)
            return yield* new JiraReconnectRequired({
              reason: "missing_scopes"
            })
          }

          const access = yield* secrets.seal(grant.accessToken).pipe(
            Effect.mapError(
              () => new JiraError({ reason: "invalid_response" })
            ),
            Effect.tapError(() => clearLease(userId, leaseId))
          )
          const refresh = yield* secrets.seal(grant.refreshToken).pipe(
            Effect.mapError(
              () => new JiraError({ reason: "invalid_response" })
            ),
            Effect.tapError(() => clearLease(userId, leaseId))
          )
          const persistedAt = yield* DateTime.now
          const persisted = yield* db
            .update(userJiraIntegration)
            .set({
              encryptedAccessToken: access.ciphertext,
              accessTokenNonce: access.nonce,
              accessTokenTag: access.tag,
              encryptedRefreshToken: refresh.ciphertext,
              refreshTokenNonce: refresh.nonce,
              refreshTokenTag: refresh.tag,
              expiresAt: grant.expiresAt,
              grantedScopes: grant.grantedScopes,
              updatedAt: DateTime.toDate(persistedAt),
              refreshLeaseId: null,
              refreshLeaseExpiresAt: null
            })
            .where(
              and(
                eq(userJiraIntegration.userId, userId),
                eq(userJiraIntegration.refreshLeaseId, leaseId)
              )
            )
            .returning({ userId: userJiraIntegration.userId })
            .pipe(Effect.orDie)
          if (persisted.length === 0) {
            continue
          }
          return { token: Redacted.make(grant.accessToken) }
        }
      }
    )

    const disconnect = Effect.fn("JiraCredentials.disconnect")(function* (
      userId: string
    ) {
      yield* db
        .delete(userJiraIntegration)
        .where(eq(userJiraIntegration.userId, userId))
        .pipe(Effect.orDie)
      return disconnected()
    })

    return JiraCredentials.of({
      status,
      beginConnect,
      completeConnect,
      completeConnectWithReturnPath,
      returnPathForState,
      accessTokenFor,
      disconnect,
      markReconnectRequired
    })
  })
)
