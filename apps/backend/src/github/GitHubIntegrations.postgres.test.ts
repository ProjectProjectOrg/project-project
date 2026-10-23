// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash, randomUUID } from "node:crypto"

import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { migrationsFolder } from "@pp/db"
import { DbLive } from "@pp/db"
import { GitHub } from "@pp/integration-github/GitHub"
import type { GitHubShape } from "@pp/integration-github/GitHub"
import { GitHubIntegrations } from "@pp/integration-github/GitHubIntegrations"
import { GitHubIntegrationsLive } from "@pp/integration-github/GitHubIntegrationsLive"
import { GitHubWebhooks } from "@pp/integration-github/GitHubWebhooks"
import { GitHubWebhooksLive } from "@pp/integration-github/GitHubWebhooksLive"
import { ProjectStateCache } from "@pp/integration-github/projectStateCache"
import * as ProjectStateCacheLayer from "@pp/integration-github/projectStateCache"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import { GitHubTicketEvents } from "@pp/server-core/github/GitHubTicketEvents"
import { MarkdownError } from "@pp/server-core/markdown/Markdown"
import type { RawProjectStates } from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { DateTime, Effect, Layer, Redacted } from "effect"
import * as Cause from "effect/Cause"
import * as Deferred from "effect/Deferred"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { GitHubHostLive } from "./HostLive"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const date = (value: string) => DateTime.toDate(DateTime.makeUnsafe(value))

const makeGithub = (
  exchangeAppUserCode: GitHubShape["exchangeAppUserCode"] = (code) =>
    Effect.succeed(`token-${code}`)
): GitHubShape => ({
  getInstallationAccount: (installationId) =>
    Effect.succeed({
      installationId,
      accountId: `account-${installationId}`,
      accountLogin: `account-${installationId}`,
      accountType: "Organization"
    }),
  listInstallationRepos: () => Effect.die("not used in callback tests"),
  verifyInstallationRepo: () => Effect.die("not used in callback tests"),
  exchangeAppUserCode,
  appUserCanAccessInstallation: () => Effect.succeed(true),
  createBranchAsUser: () => Effect.die("not used in callback tests"),
  openPullRequestAsUser: () => Effect.die("not used in callback tests"),
  fetchInstallationProjectStates: () =>
    Effect.die("not used in callback tests"),
  listInstallationBranches: () => Effect.die("not used in callback tests"),
  branchExistsInstallation: () => Effect.die("not used in callback tests")
})

describe.skipIf(!databaseUrl)("GitHub integration callback", () => {
  const userIds: Array<string> = []
  const organizationIds: Array<string> = []
  const databaseLayer = DbLive.pipe(
    Layer.provideMerge(PgClient.layer({ url: Redacted.make(databaseUrl!) }))
  )
  const webhookLayer = (events: Partial<GitHubTicketEvents["Service"]> = {}) =>
    GitHubWebhooksLive.pipe(
      Layer.provide(GitHubHostLive),
      Layer.provide(
        Layer.mergeAll(
          Layer.mock(BetterAuth, {}),
          Layer.mock(GitHubTicketEvents, events)
        )
      ),
      Layer.provideMerge(ProjectStateCacheLayer.layer),
      Layer.provide(databaseLayer)
    )
  const integrationLayer = GitHubIntegrationsLive.pipe(
    Layer.provide(Layer.succeed(GitHub, makeGithub())),
    Layer.provide(GitHubHostLive),
    Layer.provide(
      Layer.mergeAll(
        Layer.mock(BetterAuth, {}),
        Layer.mock(GitHubTicketEvents, {})
      )
    ),
    Layer.provide(BunCrypto.layer),
    Layer.provide(databaseLayer)
  )
  let pool: Pool

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error(
        "GitHub integration tests require an isolated local test database"
      )
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder
    })
  })

  afterAll(async () => {
    if (pool) {
      for (const organizationId of organizationIds) {
        await pool.query("DELETE FROM organization WHERE id = $1", [
          organizationId
        ])
      }
      for (const userId of userIds) {
        await pool.query('DELETE FROM "user" WHERE id = $1', [userId])
      }
      await pool.end()
    }
  })

  const insertSession = async (
    role: "owner" | "admin" | "member" = "owner"
  ) => {
    const userId = randomUUID()
    const organizationId = randomUUID()
    const sessionId = randomUUID()
    const state = randomUUID()
    const installationId = `installation-${sessionId}`
    const now = date("2026-09-07T12:00:00.000Z")
    userIds.push(userId)
    organizationIds.push(organizationId)
    await pool.query(
      `INSERT INTO "user" (id, name, email, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)`,
      [userId, `GitHub test ${userId}`, `${userId}@example.test`, now]
    )
    await pool.query(
      `INSERT INTO organization (id, name, slug, created_at)
       VALUES ($1, $2, $3, $4)`,
      [
        organizationId,
        `GitHub test ${organizationId}`,
        `github-${organizationId}`,
        now
      ]
    )
    await pool.query(
      `INSERT INTO member (id, organization_id, user_id, role, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [randomUUID(), organizationId, userId, role, now]
    )
    await pool.query(
      `INSERT INTO github_app_install_session
       (id, organization_id, user_id, state_hash, installation_id, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        sessionId,
        organizationId,
        userId,
        createHash("sha256").update(state).digest("hex"),
        installationId,
        date("2099-09-07T12:10:00.000Z")
      ]
    )
    return { userId, organizationId, sessionId, state, installationId }
  }

  const callback = (state: string, code: string) =>
    Effect.flatMap(GitHubIntegrations, (integrations) =>
      integrations.completeCallback(state, code)
    ).pipe(Effect.provide(integrationLayer))

  it.effect("rejects a callback when the original owner has been revoked", () =>
    Effect.gen(function* () {
      const fixture = yield* Effect.promise(() => insertSession("member"))

      const error = yield* Effect.flip(callback(fixture.state, "revoked-owner"))
      expect(error).toMatchObject({ _tag: "Forbidden" })

      const result = yield* Effect.promise(() =>
        pool.query(
          "SELECT completed_at FROM github_app_install_session WHERE id = $1",
          [fixture.sessionId]
        )
      )
      expect(result.rows[0]?.completed_at).toBeNull()
    })
  )

  it.effect("accepts a callback from an org admin", () =>
    Effect.gen(function* () {
      const fixture = yield* Effect.promise(() => insertSession("admin"))
      yield* callback(fixture.state, "admin")
      const result = yield* Effect.promise(() =>
        pool.query(
          "SELECT completed_at FROM github_app_install_session WHERE id = $1",
          [fixture.sessionId]
        )
      )
      expect(result.rows[0]?.completed_at).toBeInstanceOf(Date)
    })
  )

  it.effect("consumes a state once when callbacks race", () =>
    Effect.gen(function* () {
      const fixture = yield* Effect.promise(() => insertSession())
      let entered = 0
      let release!: () => void
      const bothEntered = new Promise<void>((resolve) => {
        release = resolve
      })
      const raceGithub = makeGithub((code) =>
        Effect.promise(async () => {
          entered += 1
          if (entered === 2) release()
          await bothEntered
          return `token-${code}`
        })
      )
      const raceLayer = GitHubIntegrationsLive.pipe(
        Layer.provide(Layer.succeed(GitHub, raceGithub)),
        Layer.provide(GitHubHostLive),
        Layer.provide(
          Layer.mergeAll(
            Layer.mock(BetterAuth, {}),
            Layer.mock(GitHubTicketEvents, {})
          )
        ),
        Layer.provide(BunCrypto.layer),
        Layer.provide(databaseLayer)
      )
      const raceCallback = (code: string) =>
        Effect.flatMap(GitHubIntegrations, (integrations) =>
          integrations.completeCallback(fixture.state, code)
        ).pipe(Effect.provide(raceLayer))
      const results = yield* Effect.all(
        [
          Effect.exit(raceCallback("first")),
          Effect.exit(raceCallback("second"))
        ],
        { concurrency: "unbounded" }
      )
      expect(results.filter(Exit.isSuccess)).toHaveLength(1)
      expect(
        results.filter((result) => {
          if (!Exit.isFailure(result)) return false
          const error = Cause.findErrorOption(result.cause)
          return (
            Option.isSome(error) && Predicate.isTagged(error.value, "NotFound")
          )
        })
      ).toHaveLength(1)
      const result = yield* Effect.promise(() =>
        pool.query(
          "SELECT completed_at FROM github_app_install_session WHERE id = $1",
          [fixture.sessionId]
        )
      )
      expect(result.rows[0]?.completed_at).not.toBeNull()
    })
  )

  it.effect(
    "rolls back the state claim when integration replacement fails",
    () =>
      Effect.gen(function* () {
        const fixture = yield* Effect.promise(() => insertSession())
        const conflictOrganizationId = randomUUID()
        const conflictIntegrationId = randomUUID()
        organizationIds.push(conflictOrganizationId)
        const now = date("2026-09-07T12:00:00.000Z")
        yield* Effect.promise(() =>
          pool.query(
            `INSERT INTO organization (id, name, slug, created_at)
       VALUES ($1, $2, $3, $4)`,
            [
              conflictOrganizationId,
              "GitHub conflict",
              `github-conflict-${conflictOrganizationId}`,
              now
            ]
          )
        )
        yield* Effect.promise(() =>
          pool.query(
            `INSERT INTO organization_integration
       (id, organization_id, provider, status, connected_at, created_at, updated_at)
       VALUES ($1, $2, 'github', 'active', $3, $3, $3)`,
            [conflictIntegrationId, conflictOrganizationId, now]
          )
        )
        yield* Effect.promise(() =>
          pool.query(
            `INSERT INTO organization_github_integration
       (organization_integration_id, installation_id, github_account_id,
        github_account_login, github_account_type)
       VALUES ($1, $2, 'conflict-account', 'conflict', 'Organization')`,
            [conflictIntegrationId, fixture.installationId]
          )
        )

        const failed = yield* Effect.exit(callback(fixture.state, "rollback"))
        expect(Exit.isFailure(failed)).toBe(true)
        const beforeRetry = yield* Effect.promise(() =>
          pool.query(
            "SELECT completed_at FROM github_app_install_session WHERE id = $1",
            [fixture.sessionId]
          )
        )
        expect(beforeRetry.rows[0]?.completed_at).toBeNull()

        yield* Effect.promise(() =>
          pool.query("DELETE FROM organization WHERE id = $1", [
            conflictOrganizationId
          ])
        )
        yield* callback(fixture.state, "retry")
        const afterRetry = yield* Effect.promise(() =>
          pool.query(
            "SELECT completed_at FROM github_app_install_session WHERE id = $1",
            [fixture.sessionId]
          )
        )
        expect(afterRetry.rows[0]?.completed_at).not.toBeNull()
      })
  )
  it.effect(
    "installation removal disconnects the integration and invalidates its repository cache",
    () =>
      Effect.gen(function* () {
        const fixture = yield* Effect.promise(() => insertSession())
        yield* callback(fixture.state, "install")
        yield* Effect.gen(function* () {
          const cache = yield* ProjectStateCache
          const webhooks = yield* GitHubWebhooks
          let reads = 0
          const fetch = Effect.sync((): RawProjectStates => {
            reads += 1
            return {
              defaultBranch: "main",
              existingBranches: new Set(),
              prByBranch: new Map(),
              mergedPrsByBranch: new Map(),
              openPullRequestText: new Map(),
              fetchedAt: date("2026-04-01T00:00:00Z")
            }
          })
          yield* cache.cachedProjectStates(
            "repo",
            fixture.installationId,
            "repo",
            fetch
          )
          yield* webhooks.handle({
            event: "installation",
            deliveryId: "removed",
            body: yield* Schema.encodeEffect(
              Schema.fromJsonString(Schema.Unknown)
            )({
              action: "deleted",
              installation: { id: fixture.installationId }
            })
          })
          yield* cache.cachedProjectStates(
            "repo",
            fixture.installationId,
            "repo",
            fetch
          )
          expect(reads).toBe(2)
        }).pipe(Effect.provide(webhookLayer()))
        const result = yield* Effect.promise(() =>
          pool.query(
            "SELECT status FROM organization_integration WHERE organization_id = $1",
            [fixture.organizationId]
          )
        )
        expect(result.rows.map((row) => row.status)).toEqual(["disconnected"])
      })
  )

  it.effect(
    "awaits a core ticket write and propagates failure after invalidating the cache",
    () =>
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const failure = new MarkdownError({
          cause: "disk full",
          message: "ticket write failed"
        })
        const events = {
          pullRequestChanged: () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.andThen(Effect.fail(failure))
            )
        }
        yield* Effect.gen(function* () {
          const cache = yield* ProjectStateCache
          const webhooks = yield* GitHubWebhooks
          let reads = 0
          let finished = false
          const fetch = Effect.sync((): RawProjectStates => {
            reads += 1
            return {
              defaultBranch: "main",
              existingBranches: new Set(),
              prByBranch: new Map(),
              mergedPrsByBranch: new Map(),
              openPullRequestText: new Map(),
              fetchedAt: date("2026-04-01T00:00:00Z")
            }
          })
          yield* cache.cachedProjectStates("repo", "123", "repo", fetch)
          const body = yield* Schema.encodeEffect(
            Schema.fromJsonString(Schema.Unknown)
          )({
            action: "opened",
            installation: { id: "123" },
            repository: { id: "456", default_branch: "main" },
            number: 1,
            pull_request: {
              number: 1,
              state: "open",
              merged: false,
              head: { ref: "feat/T-1", repo: { id: "456" } },
              base: { ref: "main" }
            }
          })
          const request = yield* webhooks
            .handle({ event: "pull_request", deliveryId: "write-failed", body })
            .pipe(
              Effect.exit,
              Effect.tap(() =>
                Effect.sync(() => {
                  finished = true
                })
              ),
              Effect.forkChild
            )
          yield* Deferred.await(started)
          yield* Effect.yieldNow
          expect(finished).toBe(false)
          yield* Deferred.succeed(release, undefined)
          const result = yield* Fiber.join(request)
          expect(Exit.isFailure(result)).toBe(true)
          if (Exit.isFailure(result))
            expect(Cause.findErrorOption(result.cause)).toMatchObject({
              _tag: "Some",
              value: { _tag: "GitHubError", message: "ticket write failed" }
            })
          yield* cache.cachedProjectStates("repo", "123", "repo", fetch)
          expect(reads).toBe(2)
        }).pipe(Effect.provide(webhookLayer(events)))
      })
  )
})
