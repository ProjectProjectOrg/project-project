// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import { Db } from "@pp/db"
import {
  githubAppInstallSession,
  organizationGithubIntegration,
  organizationIntegration,
  projectIntegrationLink
} from "@pp/db/schema"
import {
  Conflict,
  Forbidden,
  GitHubError,
  type GitHubInstallationAccount,
  type GithubInstallationChoices,
  NotFound,
  OrgScope,
  RateLimited,
  type GithubOrgIntegrationStatus,
  type Slug
} from "@pp/shared"
import { and, eq, gt, inArray, isNull, ne, or } from "drizzle-orm"
import * as Config from "effect/Config"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Base64Url from "effect/encoding/Base64Url"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"

import { GitHub } from "./GitHub"
import {
  GitHubIntegrations,
  type GitHubIntegrationsShape
} from "./GitHubIntegrations"
import { GitHubHost } from "./Host"

const hashState = (state: string) =>
  createHash("sha256").update(state).digest("hex")

const configError = new GitHubError({
  message: "missing GitHub App configuration"
})

type InstallSession = typeof githubAppInstallSession.$inferSelect

const githubAuthorizeUrl = (
  state: string
): Effect.Effect<string, GitHubError> =>
  Effect.gen(function* () {
    const clientId = yield* Config.String("GITHUB_APP_CLIENT_ID")
    const url = new URL("https://github.com/login/oauth/authorize")
    url.searchParams.set("client_id", clientId)
    url.searchParams.set("state", state)
    return url.toString()
  }).pipe(Effect.mapError(() => configError))

const githubInstallUrl = (state: string): Effect.Effect<string, GitHubError> =>
  Effect.gen(function* () {
    const raw = yield* Config.String("GITHUB_APP_INSTALL_URL")
    const url = new URL(raw)
    url.searchParams.set("state", state)
    return url.toString()
  }).pipe(Effect.mapError(() => configError))

export const GitHubIntegrationsLive = Layer.effect(
  GitHubIntegrations,
  Effect.gen(function* () {
    const db = yield* Db
    const crypto = yield* Crypto.Crypto
    const sql = yield* SqlClient.SqlClient
    const github = yield* GitHub
    const host = yield* GitHubHost

    const connectedOrgGithub = (organizationId: string) =>
      db
        .select({
          integrationId: organizationIntegration.id,
          status: organizationIntegration.status,
          lastCheckedAt: organizationIntegration.lastCheckedAt,
          lastCheckError: organizationIntegration.lastCheckError,
          installationId: organizationGithubIntegration.installationId,
          accountLogin: organizationGithubIntegration.githubAccountLogin,
          accountType: organizationGithubIntegration.githubAccountType
        })
        .from(organizationIntegration)
        .innerJoin(
          organizationGithubIntegration,
          eq(
            organizationGithubIntegration.organizationIntegrationId,
            organizationIntegration.id
          )
        )
        .where(
          and(
            eq(organizationIntegration.organizationId, organizationId),
            eq(organizationIntegration.provider, "github"),
            inArray(organizationIntegration.status, ["active", "broken"])
          )
        )
        .limit(1)
        .pipe(
          Effect.orDie,
          Effect.map((rows) => rows[0] ?? null)
        )

    const getStatus = (): Effect.Effect<
      GithubOrgIntegrationStatus,
      never,
      OrgScope
    > =>
      Effect.gen(function* () {
        const org = yield* OrgScope
        const row = yield* connectedOrgGithub(org.organizationId)
        if (!row) {
          return {
            status: "not_connected",
            accountLogin: null,
            accountType: null,
            lastCheckedAt: null,
            lastCheckError: null
          }
        }
        return {
          status: row.status === "active" ? "active" : "broken",
          accountLogin: row.accountLogin,
          accountType: row.accountType,
          lastCheckedAt: row.lastCheckedAt,
          lastCheckError: row.lastCheckError
        }
      })

    const startInstall = (
      returnProjectSlug: Slug | null | undefined
    ): Effect.Effect<
      Readonly<{ installUrl: string }>,
      NotFound | GitHubError,
      OrgScope
    > =>
      Effect.gen(function* () {
        const org = yield* OrgScope
        const returnProject =
          returnProjectSlug == null
            ? null
            : yield* host.installationProject(
                org.organizationId,
                returnProjectSlug
              )
        if (returnProjectSlug != null && !returnProject) {
          return yield* new NotFound()
        }

        const state = Base64Url.encode(
          yield* crypto.randomBytes(32).pipe(Effect.orDie)
        )
        const now = yield* DateTime.now
        const expiresAt = DateTime.toDate(DateTime.add(now, { minutes: 10 }))
        yield* db
          .insert(githubAppInstallSession)
          .values({
            organizationId: org.organizationId,
            userId: org.userId,
            returnProjectId: returnProject?.id ?? null,
            returnProjectOrgId: returnProject?.organizationId ?? null,
            stateHash: hashState(state),
            expiresAt
          })
          .pipe(Effect.orDie)

        return { installUrl: yield* githubAuthorizeUrl(state) }
      })

    const sessionForState = (
      state: string
    ): Effect.Effect<InstallSession, NotFound> =>
      Effect.gen(function* () {
        const now = yield* DateTime.nowAsDate
        const session = yield* db.query.githubAppInstallSession
          .findFirst({
            where: {
              RAW: (table, _operators) =>
                _operators.eq(table.stateHash, hashState(state))
            }
          })
          .pipe(Effect.orDie)
        if (!session || session.completedAt || session.expiresAt < now) {
          return yield* new NotFound()
        }
        return session
      })

    const completeSetup = (
      state: string,
      installationId: string
    ): Effect.Effect<
      Readonly<{ authorizeUrl: string }>,
      NotFound | GitHubError
    > =>
      Effect.gen(function* () {
        const session = yield* sessionForState(state)
        const now = yield* DateTime.nowAsDate
        yield* db
          .update(githubAppInstallSession)
          .set({ installationId })
          .where(
            and(
              eq(githubAppInstallSession.id, session.id),
              isNull(githubAppInstallSession.completedAt),
              gt(githubAppInstallSession.expiresAt, now),
              or(
                isNull(githubAppInstallSession.installationId),
                eq(githubAppInstallSession.installationId, installationId)
              )
            )
          )
          .returning({ id: githubAppInstallSession.id })
          .pipe(
            Effect.orDie,
            Effect.flatMap((rows) =>
              rows[0] ? Effect.void : Effect.fail(new NotFound())
            )
          )
        return { authorizeUrl: yield* githubAuthorizeUrl(state) }
      })

    const connectInstallation = (
      session: InstallSession,
      account: GitHubInstallationAccount
    ): Effect.Effect<
      Readonly<{ redirectUrl: string }>,
      NotFound | Forbidden | GitHubError
    > =>
      Effect.gen(function* () {
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              const now = yield* DateTime.nowAsDate
              yield* host.requireInstallPermission(
                session.organizationId,
                session.userId
              )

              const [claimed] = yield* db
                .update(githubAppInstallSession)
                .set({
                  completedAt: now,
                  installationId: account.installationId
                })
                .where(
                  and(
                    eq(githubAppInstallSession.id, session.id),
                    isNull(githubAppInstallSession.completedAt),
                    gt(githubAppInstallSession.expiresAt, now),
                    or(
                      isNull(githubAppInstallSession.installationId),
                      eq(
                        githubAppInstallSession.installationId,
                        account.installationId
                      )
                    )
                  )
                )
                .returning({ id: githubAppInstallSession.id })
                .pipe(Effect.orDie)
              if (!claimed) return yield* new NotFound()

              const previousGithubIntegrations = yield* db
                .select({ id: organizationIntegration.id })
                .from(organizationIntegration)
                .innerJoin(
                  organizationGithubIntegration,
                  eq(
                    organizationGithubIntegration.organizationIntegrationId,
                    organizationIntegration.id
                  )
                )
                .where(
                  and(
                    eq(
                      organizationIntegration.organizationId,
                      session.organizationId
                    ),
                    eq(organizationIntegration.provider, "github")
                  )
                )
                .pipe(Effect.orDie)
              const previousIntegrationIds = previousGithubIntegrations.map(
                (integration) => integration.id
              )

              yield* db
                .update(organizationIntegration)
                .set({
                  status: "disconnected",
                  disconnectedAt: now,
                  updatedAt: now
                })
                .where(
                  and(
                    eq(
                      organizationIntegration.organizationId,
                      session.organizationId
                    ),
                    eq(organizationIntegration.provider, "github"),
                    inArray(organizationIntegration.status, [
                      "active",
                      "broken"
                    ])
                  )
                )
                .pipe(Effect.orDie)

              yield* previousIntegrationIds.length === 0
                ? Effect.void
                : db
                    .delete(organizationGithubIntegration)
                    .where(
                      inArray(
                        organizationGithubIntegration.organizationIntegrationId,
                        previousIntegrationIds
                      )
                    )
                    .pipe(Effect.orDie)

              const [created] = yield* db
                .insert(organizationIntegration)
                .values({
                  organizationId: session.organizationId,
                  provider: "github",
                  status: "active",
                  lastCheckedAt: now,
                  lastCheckStatus: "ok"
                })
                .returning()
                .pipe(Effect.orDie)

              yield* db
                .insert(organizationGithubIntegration)
                .values({
                  organizationIntegrationId: created.id,
                  installationId: account.installationId,
                  githubAccountId: account.accountId,
                  githubAccountLogin: account.accountLogin,
                  githubAccountType: account.accountType
                })
                .pipe(Effect.orDie)

              yield* previousIntegrationIds.length === 0
                ? Effect.void
                : db
                    .update(projectIntegrationLink)
                    .set({
                      organizationIntegrationId: created.id,
                      updatedAt: now
                    })
                    .where(
                      and(
                        eq(
                          projectIntegrationLink.organizationId,
                          session.organizationId
                        ),
                        eq(projectIntegrationLink.provider, "github"),
                        inArray(projectIntegrationLink.status, [
                          "active",
                          "broken"
                        ]),
                        inArray(
                          projectIntegrationLink.organizationIntegrationId,
                          previousIntegrationIds
                        )
                      )
                    )
                    .pipe(Effect.orDie)
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die))

        const redirectUrl = yield* host.installationRedirect(
          session.organizationId,
          session.returnProjectId
        )
        return { redirectUrl }
      })

    const completeCallback = (
      state: string,
      code: string
    ): Effect.Effect<
      Readonly<{ redirectUrl: string }>,
      NotFound | Forbidden | RateLimited | GitHubError
    > =>
      Effect.gen(function* () {
        const session = yield* sessionForState(state)
        const userToken = yield* github.exchangeAppUserCode(code)
        const installations = yield* github.listAppUserInstallations(userToken)
        const installationId = session.installationId
        if (installationId) {
          const canAccess = installations.some(
            (installation) => installation.installationId === installationId
          )
          if (!canAccess) return yield* new Forbidden()
          const account = yield* github
            .getInstallationAccount(installationId)
            .pipe(
              Effect.catchTag("RepoGone", () =>
                Effect.fail(
                  new GitHubError({ message: "installation not found" })
                )
              )
            )
          return yield* connectInstallation(session, account)
        }
        if (installations.length === 0) {
          return { redirectUrl: yield* githubInstallUrl(state) }
        }
        const now = yield* DateTime.nowAsDate
        yield* db
          .update(githubAppInstallSession)
          .set({ candidateInstallations: installations })
          .where(
            and(
              eq(githubAppInstallSession.id, session.id),
              isNull(githubAppInstallSession.completedAt),
              isNull(githubAppInstallSession.installationId),
              gt(githubAppInstallSession.expiresAt, now)
            )
          )
          .returning({ id: githubAppInstallSession.id })
          .pipe(
            Effect.orDie,
            Effect.flatMap((rows) =>
              rows[0] ? Effect.void : Effect.fail(new NotFound())
            )
          )
        return {
          redirectUrl: yield* host.installationChoiceRedirect(
            session.organizationId,
            state
          )
        }
      })

    const choiceSession = (state: string) =>
      Effect.gen(function* () {
        const org = yield* OrgScope
        const session = yield* sessionForState(state)
        if (
          session.organizationId !== org.organizationId ||
          session.userId !== org.userId ||
          session.installationId !== null ||
          session.candidateInstallations === null
        ) {
          return yield* new NotFound()
        }
        return { session, candidates: session.candidateInstallations }
      })

    const installationsConnectedElsewhere = (
      organizationId: string,
      installationIds: ReadonlyArray<string>
    ) =>
      installationIds.length === 0
        ? Effect.succeed(new Set<string>())
        : db
            .select({
              installationId: organizationGithubIntegration.installationId
            })
            .from(organizationGithubIntegration)
            .innerJoin(
              organizationIntegration,
              eq(
                organizationIntegration.id,
                organizationGithubIntegration.organizationIntegrationId
              )
            )
            .where(
              and(
                inArray(
                  organizationGithubIntegration.installationId,
                  installationIds
                ),
                ne(organizationIntegration.organizationId, organizationId)
              )
            )
            .pipe(
              Effect.orDie,
              Effect.map(
                (rows) => new Set(rows.map((row) => row.installationId))
              )
            )

    const installationChoices = (
      state: string
    ): Effect.Effect<GithubInstallationChoices, NotFound, OrgScope> =>
      Effect.gen(function* () {
        const { session, candidates } = yield* choiceSession(state)
        const elsewhere = yield* installationsConnectedElsewhere(
          session.organizationId,
          candidates.map((candidate) => candidate.installationId)
        )
        return {
          installations: candidates.map((candidate) => ({
            installationId: candidate.installationId,
            accountLogin: candidate.accountLogin,
            accountType: candidate.accountType,
            connectedElsewhere: elsewhere.has(candidate.installationId)
          }))
        }
      })

    const chooseInstallation = (
      state: string,
      installationId: string | null
    ): Effect.Effect<
      Readonly<{ redirectUrl: string }>,
      NotFound | Forbidden | Conflict | GitHubError,
      OrgScope
    > =>
      Effect.gen(function* () {
        const { session, candidates } = yield* choiceSession(state)
        if (installationId === null) {
          return { redirectUrl: yield* githubInstallUrl(state) }
        }
        const account = candidates.find(
          (candidate) => candidate.installationId === installationId
        )
        if (!account) return yield* new NotFound()
        const elsewhere = yield* installationsConnectedElsewhere(
          session.organizationId,
          [installationId]
        )
        if (elsewhere.has(installationId)) {
          return yield* new Conflict({
            reason: "installation_connected_elsewhere"
          })
        }
        return yield* connectInstallation(session, account)
      })

    const listRepos = (query: string | undefined, page: number) =>
      Effect.gen(function* () {
        const org = yield* OrgScope
        const integration = yield* connectedOrgGithub(org.organizationId)
        if (!integration || integration.status !== "active") {
          return yield* new NotFound()
        }
        return yield* github.listInstallationRepos(
          integration.installationId,
          query,
          page
        )
      })

    return {
      getStatus,
      startInstall,
      completeSetup,
      completeCallback,
      installationChoices,
      chooseInstallation,
      listRepos
    } satisfies GitHubIntegrationsShape
  })
)
