import { randomUUID } from "node:crypto"
import { PgClient } from "@effect/sql-pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { DateTime, Effect, Layer, Redacted, Schema } from "effect"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import {
  JiraMigrationConfiguration,
  JiraMigrationRequirements
} from "@projectproject/shared"
import { DbLive } from "../Layers/Db"
import {
  JiraMigrationProjection,
  type AttemptFence
} from "./MigrationProjection"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const source = {
  cloudId: "cloud-1",
  siteName: "Example",
  siteUrl: "https://example.atlassian.net",
  projectId: "10000",
  projectKey: "APP",
  projectName: "Application"
}

describe.skipIf(!databaseUrl)("Jira migration projection CAS", () => {
  let pool: Pool
  let layer: Layer.Layer<JiraMigrationProjection>
  const owners: Array<{ organizationId: string; userId: string }> = []
  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    )
      throw new Error("Isolated database required")
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: `${import.meta.dirname}/../db/migrations`
    })
    layer = JiraMigrationProjection.layer.pipe(
      Layer.provide(
        DbLive.pipe(
          Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl!) }))
        )
      ),
      Layer.orDie
    )
  })
  afterAll(async () => {
    for (const owner of owners) {
      await pool.query('delete from "organization" where id = $1', [
        owner.organizationId
      ])
      await pool.query('delete from "user" where id = $1', [owner.userId])
    }
    await pool.end()
  })
  const fixture = async () => {
    const owner = { organizationId: randomUUID(), userId: randomUUID() }
    owners.push(owner)
    await pool.query(
      'insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,false,now(),now())',
      [owner.userId, `${owner.userId}@example.test`]
    )
    await pool.query(
      'insert into "organization" (id,name,slug,created_at) values ($1,$1,$1,now())',
      [owner.organizationId]
    )
    return {
      ...owner,
      requestId: randomUUID(),
      source,
      executionId: randomUUID()
    }
  }
  const fence = (row: {
    id: string
    workflowExecutionId: string | null
    workflowAttempt: number
  }): AttemptFence => ({
    migrationId: row.id,
    workflowExecutionId: row.workflowExecutionId!,
    workflowAttempt: row.workflowAttempt
  })

  it("converges repeated creation and rejects every changed source field", async () => {
    const input = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const rows = yield* Effect.all(
          Array.from({ length: 4 }, () => p.ensureCreated(input)),
          { concurrency: "unbounded" }
        )
        expect(rows.map((row) => row.id)).toEqual(
          Array(4).fill(input.executionId)
        )
        expect(rows[0]).toMatchObject({ workflowAttempt: 1, scanRevision: 1 })
        for (const key of Object.keys(source) as Array<keyof typeof source>) {
          expect(
            yield* Effect.result(
              p.ensureCreated({
                ...input,
                source: { ...source, [key]: `${source[key]}-different` }
              })
            )
          ).toMatchObject({ _tag: "Failure", failure: { _tag: "Conflict" } })
        }
      }).pipe(Effect.provide(layer))
    )
  })

  it("does not adopt a legacy row as a workflow execution", async () => {
    const input = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        yield* p.ensureCreated(input)
      }).pipe(Effect.provide(layer))
    )
    await pool.query(
      "update jira_migration set workflow_execution_id = null, workflow_attempt = 0, scan_revision = 0 where id = $1",
      [input.executionId]
    )
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        expect(yield* Effect.result(p.ensureCreated(input))).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "Conflict" }
        })
        expect(
          yield* Effect.result(
            p.beginRescan({
              migrationId: input.executionId,
              supersededExecutionId: "legacy-execution",
              expectedRevision: 0,
              workflowAttempt: 1,
              scanRevision: 1,
              executionId: "adoption"
            })
          )
        ).toMatchObject({ _tag: "Failure", failure: { _tag: "Conflict" } })
        expect(
          (yield* p.owned(input, input.executionId)).workflowExecutionId
        ).toBeNull()
      }).pipe(Effect.provide(layer))
    )
  })

  it("converges rescans and fences old progress and finalizers", async () => {
    const input = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const old = yield* p.ensureCreated(input)
        yield* p.advance(fence(old), {
          status: "needs_configuration",
          phase: "configuration"
        })
        const ready = yield* p.owned(input, old.id)
        const next = {
          migrationId: old.id,
          supersededExecutionId: input.executionId,
          expectedRevision: ready.revision,
          workflowAttempt: 2,
          scanRevision: 2,
          executionId: "rescan-execution"
        }
        expect(
          yield* Effect.result(
            p.beginRescan({
              ...next,
              supersededExecutionId: "wrong-predecessor"
            })
          )
        ).toMatchObject({ _tag: "Failure", failure: { _tag: "Conflict" } })
        const rescans = yield* Effect.all(
          [p.beginRescan(next), p.beginRescan(next)],
          { concurrency: "unbounded" }
        )
        expect(rescans.map((row) => row.workflowAttempt)).toEqual([2, 2])
        expect(rescans.map((row) => row.supersededExecutionId)).toEqual([
          input.executionId,
          input.executionId
        ])
        expect((yield* p.beginRescan(next)).supersededExecutionId).toBe(
          input.executionId
        )
        expect(yield* p.advance(fence(old), { progressDone: 99 })).toBe(false)
        expect(
          yield* p.advance(
            {
              migrationId: old.id,
              workflowExecutionId: "rescan-execution",
              workflowAttempt: 1
            },
            { progressDone: 98 }
          )
        ).toBe(false)
        expect(
          yield* p.advance(
            {
              migrationId: old.id,
              workflowExecutionId: input.executionId,
              workflowAttempt: 2
            },
            { progressDone: 97 }
          )
        ).toBe(false)
        expect(
          yield* p.recordFailure(fence(old), {
            reason: "old-finalizer",
            retryable: false
          })
        ).toBe(false)
        expect(yield* p.owned(input, old.id)).toMatchObject({
          workflowAttempt: 2,
          scanRevision: 2,
          workflowExecutionId: "rescan-execution",
          progressDone: 0,
          status: "scanning",
          failureReason: null
        })
        expect(
          yield* Effect.result(p.beginRescan({ ...next, executionId: "other" }))
        ).toMatchObject({ _tag: "Failure", failure: { _tag: "Conflict" } })
      }).pipe(Effect.provide(layer))
    )
  })

  it("reserves hidden ready and reconnect imports for reset while rejecting discard and competing commands", async () => {
    for (const status of ["ready", "reconnect_required"] as const) {
      const input = await fixture()
      await Effect.runPromise(
        Effect.gen(function* () {
          const p = yield* JiraMigrationProjection
          const created = yield* p.ensureCreated(input)
          yield* p.completeScan(fence(created), emptyScan)
          const scanned = yield* p.owned(input, created.id)
          const ready = yield* p.saveConfiguration({
            owner: input,
            migrationId: created.id,
            expectedRevision: scanned.revision,
            configuration: emptyConfiguration
          })
          yield* p.transition({
            owner: input,
            migrationId: created.id,
            expectedRevision: ready.revision,
            action: "run"
          })
          yield* p.advance(fence(created), {
            status,
            destinationProjectId: randomUUID()
          })
          const current = yield* p.owned(input, created.id)
          const discard = {
            expectedRevision: current.revision,
            executionId: "discard-ineligible",
            mode: "discard" as const
          }
          expect(yield* p.claimCleanup(fence(current), discard)).toBe(false)
          const reset = {
            expectedRevision: current.revision,
            executionId: "reset-import",
            mode: "reset_import" as const
          }
          expect(yield* p.claimCleanup(fence(current), reset)).toBe(true)
          expect(yield* p.claimCleanup(fence(current), reset)).toBe(true)
          expect(
            yield* p.claimCleanup(fence(current), {
              ...reset,
              executionId: "competing-reset"
            })
          ).toBe(false)
          expect(
            yield* Effect.result(
              p.transition({
                owner: input,
                migrationId: current.id,
                expectedRevision: current.revision,
                action: "run"
              })
            )
          ).toMatchObject({ _tag: "Failure", failure: { _tag: "Conflict" } })
          expect(
            yield* p.deleteAfterCleanup(fence(current), "reset-import")
          ).toBe(false)
          expect(
            yield* p.releaseCleanup(
              fence(current),
              "wrong-reset",
              "reset_import"
            )
          ).toBe(false)
          expect(
            yield* p.releaseCleanup(
              fence(current),
              "reset-import",
              "reset_import"
            )
          ).toBe(true)
          const released = yield* p.owned(input, current.id)
          expect(released).toMatchObject({
            status,
            cleanupExecutionId: null,
            revision: current.revision + 2
          })
          expect(yield* p.claimCleanup(fence(released), reset)).toBe(false)
        }).pipe(Effect.provide(layer))
      )
    }
  })

  it("allows only one winner between cleanup and retry", async () => {
    const input = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const created = yield* p.ensureCreated(input)
        yield* p.recordFailure(fence(created), {
          reason: "network_error",
          retryable: true
        })
        const failed = yield* p.owned(input, created.id)
        expect(failed.failureSequence).toBe(1)
        expect(
          yield* p.recordFailure(fence(created), {
            reason: "duplicate-finalizer",
            retryable: false
          })
        ).toBe(false)
        expect((yield* p.owned(input, created.id)).failureSequence).toBe(1)
        expect(failed.retainedUntil).not.toBeNull()
        const results = yield* Effect.all(
          [
            p.claimCleanup(fence(failed), {
              mode: "discard",
              expectedRevision: failed.revision,
              executionId: "cleanup-1"
            }),
            p
              .transition({
                owner: input,
                migrationId: failed.id,
                expectedRevision: failed.revision,
                action: "run"
              })
              .pipe(
                Effect.as(true),
                Effect.orElseSucceed(() => false)
              )
          ],
          { concurrency: "unbounded" }
        )
        expect(results.filter(Boolean)).toHaveLength(1)
        const current = yield* p.owned(input, created.id)
        if (results[0]) {
          expect(current.cleanupExecutionId).toBe("cleanup-1")
          expect(yield* p.deleteAfterCleanup(fence(failed), "wrong")).toBe(
            false
          )
          expect(
            yield* p.releaseCleanup(fence(failed), "wrong", "discard")
          ).toBe(false)
          expect(
            yield* p.releaseCleanup(fence(failed), "cleanup-1", "discard")
          ).toBe(true)
          const released = yield* p.owned(input, created.id)
          expect(
            yield* p.claimCleanup(fence(released), {
              mode: "discard",
              expectedRevision: released.revision,
              executionId: "cleanup-2"
            })
          ).toBe(true)
          expect(
            yield* p.deleteAfterCleanup(fence(released), "cleanup-2")
          ).toBe(true)
        } else
          expect(current).toMatchObject({
            status: "scanning",
            cleanupExecutionId: null,
            retainedUntil: null
          })
      }).pipe(Effect.provide(layer))
    )
  })

  it("saves incomplete drafts, rejects stale revisions, and protects cleanup ownership", async () => {
    const input = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const row = yield* p.ensureCreated(input)
        const requirements = {
          destination: {
            suggestedName: "Application",
            suggestedSlug: "application",
            suggestedKey: "APP"
          },
          identities: [],
          identityOptions: [],
          statuses: [],
          statusOptions: [],
          issueTypes: [
            {
              jiraIssueTypeId: "bug",
              name: "Bug",
              isSubtask: false,
              suggestedProjectType: "bug"
            }
          ],
          priorities: [],
          tags: [],
          activeFutureSprintChoices: [],
          restrictedContent: {
            issueCount: 0,
            commentCount: 0,
            worklogCount: 0
          },
          attachments: []
        }
        const configuration = yield* Schema.decodeEffect(
          JiraMigrationConfiguration
        )({
          destination: { name: "Application", slug: "application", key: "APP" },
          identities: [],
          statuses: [],
          issueTypes: [],
          priorities: [],
          tags: [],
          activeFutureSprintChoices: [],
          restrictedContent: { policy: "exclude" },
          skippedAttachmentIds: [],
          attachmentSkipsAccepted: false
        })
        const scan = {
          manifest: {
            key: `migrations/jira/${row.id}/scan-1/manifest/manifest-v2/snapshot.json`,
            sha256: "a".repeat(64),
            byteSize: 10,
            contentType: "application/json"
          },
          requirements: yield* Schema.decodeUnknownEffect(
            JiraMigrationRequirements
          )(requirements),
          summary: {
            siteName: source.siteName,
            siteUrl: source.siteUrl,
            projectName: source.projectName,
            projectKey: source.projectKey,
            scannedAt: DateTime.makeUnsafe("2026-09-22T00:00:00Z"),
            counts: {
              identities: 0,
              statuses: 0,
              issueTypes: 1,
              priorities: 0,
              tags: 0,
              issues: 0,
              comments: 0,
              attachments: 0,
              groups: 0,
              restrictions: 0
            },
            visibilityWarnings: []
          }
        }
        yield* p.recordScanFailure(fence(row), "metadata/0", {
          reason: "network",
          retryable: true,
          reconnect: false
        })
        yield* p.resumeScan(fence(row), 1)
        expect(yield* p.completeScan(fence(row), scan)).toBe(true)
        const scanned = yield* p.owned(input, row.id)
        const save = {
          owner: input,
          migrationId: row.id,
          expectedRevision: scanned.revision,
          configuration
        }
        const unchosen = yield* p.saveConfiguration({
          ...save,
          configuration: {
            ...configuration,
            issueTypes: [{ jiraIssueTypeId: "bug", projectType: "bug" }],
            restrictedContent: null
          }
        })
        expect(unchosen).toMatchObject({
          status: "needs_configuration",
          configuration: { restrictedContent: null }
        })
        const draft = yield* p.saveConfiguration({
          ...save,
          expectedRevision: unchosen.revision
        })
        expect(draft).toMatchObject({
          status: "needs_configuration",
          configuration: { issueTypes: [] }
        })
        expect(yield* Effect.result(p.saveConfiguration(save))).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "Conflict" }
        })
        const complete = yield* p.saveConfiguration({
          ...save,
          expectedRevision: draft.revision,
          configuration: {
            ...configuration,
            issueTypes: [{ jiraIssueTypeId: "bug", projectType: "bug" }]
          }
        })
        expect(complete.status).toBe("ready")
        expect(yield* p.completeScan(fence(row), scan)).toBe(true)
        const replayed = yield* p.owned(input, row.id)
        expect(replayed.status).toBe("ready")
        expect(replayed.checkpoint).toMatchObject({
          scanFailureReceipts: { "metadata/0": 1 }
        })
        expect(
          yield* p.completeScan(fence(row), {
            ...scan,
            manifest: { ...scan.manifest, sha256: "b".repeat(64) }
          })
        ).toBe(false)
        yield* p.transition({
          owner: input,
          migrationId: row.id,
          expectedRevision: replayed.revision,
          action: "run"
        })
        expect(yield* p.completeScan(fence(row), scan)).toBe(true)
        expect((yield* p.owned(input, row.id)).status).toBe("migrating")
        expect(yield* p.resumeScan(fence(row), 1)).toEqual({ _tag: "Resumed" })
        expect(yield* p.resumeScan(fence(row), 0)).toEqual({
          _tag: "AwaitRetry",
          failureSequence: 1
        })
        expect((yield* p.owned(input, row.id)).status).toBe("migrating")

        yield* p.recordFailure(fence(row), {
          reason: "network",
          retryable: true
        })
        const failed = yield* p.owned(input, row.id)
        expect(
          yield* p.claimCleanup(fence(row), {
            mode: "discard",
            expectedRevision: failed.revision,
            executionId: "cleanup"
          })
        ).toBe(true)
        expect(yield* p.advance(fence(row), { status: "ready" })).toBe(false)
        expect(
          yield* p.recordFailure(fence(row), {
            reason: "late",
            retryable: true
          })
        ).toBe(false)
        expect(
          yield* Effect.result(
            p.saveConfiguration({
              ...save,
              expectedRevision: failed.revision + 1
            })
          )
        ).toMatchObject({ _tag: "Failure", failure: { _tag: "Validation" } })
        expect(
          yield* p.releaseCleanup(
            { ...fence(row), workflowAttempt: 0 },
            "cleanup",
            "discard"
          )
        ).toBe(false)
        expect(
          yield* p.deleteAfterCleanup(
            { ...fence(row), workflowExecutionId: "old" },
            "cleanup"
          )
        ).toBe(false)
        expect(yield* p.releaseCleanup(fence(row), "cleanup", "discard")).toBe(
          true
        )
        const released = yield* p.owned(input, row.id)
        expect(p.actionsFor(released).canDiscard).toBe(true)
        expect(
          yield* p.claimCleanup(fence(row), {
            mode: "discard",
            expectedRevision: released.revision,
            executionId: "cleanup-next"
          })
        ).toBe(true)
        expect(yield* p.deleteAfterCleanup(fence(row), "cleanup")).toBe(false)
        expect(yield* p.deleteAfterCleanup(fence(row), "cleanup-next")).toBe(
          true
        )
        expect(yield* Effect.result(p.owned(input, row.id))).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "NotFound" }
        })
      }).pipe(Effect.provide(layer))
    )
  })

  it("freezes accepted configuration and routes corrected drafts through a fresh retry gate", async () => {
    const input = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const row = yield* p.ensureCreated(input)
        yield* p.recordScanFailure(fence(row), "metadata/0", {
          reason: "network",
          retryable: true,
          reconnect: false
        })
        yield* p.resumeScan(fence(row), 1)
        yield* p.completeScan(fence(row), emptyScan)
        const scanned = yield* p.owned(input, row.id)
        expect(scanned.checkpoint).toMatchObject({
          currentGate: { version: 1, _tag: "StartImport", scanRevision: 1 }
        })
        const saved = yield* p.saveConfiguration({
          owner: input,
          migrationId: row.id,
          expectedRevision: scanned.revision,
          configuration: emptyConfiguration
        })
        yield* p.transition({
          owner: input,
          migrationId: row.id,
          expectedRevision: saved.revision,
          action: "run"
        })
        const accepted = yield* p.owned(input, row.id)
        expect(accepted.checkpoint).toMatchObject({
          acceptedConfiguration: {
            configurationRevision: saved.revision + 1,
            configuration: emptyConfiguration
          },
          scanFailureReceipts: { "metadata/0": 1 }
        })
        yield* p.recordFailure(fence(row), {
          reason: "preflight_blocked",
          retryable: false
        })
        const failed = yield* p.owned(input, row.id)
        expect(failed.checkpoint).toMatchObject({
          currentGate: {
            version: 1,
            _tag: "Retry",
            failureSequence: 2,
            phase: "import"
          }
        })
        const corrected = {
          ...emptyConfiguration,
          destination: { ...emptyConfiguration.destination, name: "Corrected" }
        }
        const ready = yield* p.saveConfiguration({
          owner: input,
          migrationId: row.id,
          expectedRevision: failed.revision,
          configuration: corrected
        })
        expect(ready.status).toBe("ready")
        yield* p.transition({
          owner: input,
          migrationId: row.id,
          expectedRevision: ready.revision,
          action: "run"
        })
        const retried = yield* p.owned(input, row.id)
        expect(retried.checkpoint).toMatchObject({
          currentGate: { _tag: "Retry", failureSequence: 2 },
          acceptedConfiguration: {
            configurationRevision: ready.revision + 1,
            configuration: corrected
          }
        })
        yield* p.recordFailure(fence(row), {
          reason: "network",
          retryable: true
        })
        const retry = yield* p.owned(input, row.id)
        yield* p.transition({
          owner: input,
          migrationId: row.id,
          expectedRevision: retry.revision,
          action: "run"
        })
        expect((yield* p.owned(input, row.id)).checkpoint).toMatchObject({
          acceptedConfiguration: { configurationRevision: ready.revision + 1 }
        })
      }).pipe(Effect.provide(layer))
    )
  })

  it("accepts reconnect scan retry and finalizes only the current cancelling attempt", async () => {
    const input = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const row = yield* p.ensureCreated(input)
        yield* p.recordScanFailure(fence(row), "network/0", {
          reason: "reconnect_required",
          retryable: true,
          reconnect: true
        })
        const failed = yield* p.owned(input, row.id)
        const resumed = yield* p.transition({
          owner: input,
          migrationId: row.id,
          expectedRevision: failed.revision,
          action: "run"
        })
        expect(resumed.status).toBe("scanning")
        expect((yield* p.owned(input, row.id)).retainedUntil).toBeNull()
        yield* p.transition({
          owner: input,
          migrationId: row.id,
          expectedRevision: resumed.revision,
          action: "cancel"
        })
        expect(
          yield* p.finalizeInterrupted({ ...fence(row), workflowAttempt: 0 })
        ).toBe(false)
        expect(yield* p.finalizeInterrupted(fence(row))).toBe(true)
        const cancelled = yield* p.owned(input, row.id)
        expect(cancelled.status).toBe("cancelled")
        expect(
          cancelled.retainedUntil!.getTime() - cancelled.finishedAt!.getTime()
        ).toBe(30 * 86400000)
        expect(yield* p.finalizeInterrupted(fence(row))).toBe(false)
      }).pipe(Effect.provide(layer))
    )
  })

  it("does not let a late failure downgrade success and enforces ownership", async () => {
    const input = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const row = yield* p.ensureCreated(input)
        yield* p.advance(fence(row), { status: "succeeded", phase: "done" })
        expect(
          yield* p.recordFailure(fence(row), {
            reason: "late-finalizer",
            retryable: false
          })
        ).toBe(false)
        expect((yield* p.listOwned(input)).map((row) => row.status)).toEqual([
          "succeeded"
        ])
        expect(
          yield* Effect.result(
            p.owned({ ...input, userId: "someone-else" }, row.id)
          )
        ).toMatchObject({ _tag: "Failure", failure: { _tag: "NotFound" } })
      }).pipe(Effect.provide(layer))
    )
  })
  it("retains failure receipts across concurrent failures, retry acceptance, and checkpoint writes", async () => {
    const input = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const row = yield* p.ensureCreated(input)
        const current = fence(row)
        const failure = {
          reason: "jira_network",
          retryable: true,
          reconnect: false
        }
        const sequences = yield* Effect.all(
          [
            p.recordScanFailure(current, "issues/0/0", failure),
            p.recordScanFailure(current, "comments/1/0", failure)
          ],
          { concurrency: 2 }
        )
        expect(sequences).toEqual([1, 1])
        expect(yield* p.resumeScan(current, 1)).toEqual({ _tag: "Resumed" })
        expect(yield* p.resumeScan(current, 1)).toEqual({ _tag: "Resumed" })
        yield* p.advance(current, { checkpoint: {}, progressDone: 4 })
        expect(yield* p.recordScanFailure(current, "issues/0/0", failure)).toBe(
          1
        )
        expect((yield* p.owned(input, row.id)).status).toBe("scanning")
        expect(yield* p.recordScanFailure(current, "issues/0/1", failure)).toBe(
          2
        )
        expect(yield* p.resumeScan(current, 1)).toEqual({
          _tag: "AwaitRetry",
          failureSequence: 2
        })
        expect((yield* p.owned(input, row.id)).failureSequence).toBe(2)
        expect(
          yield* p.resumeScan({ ...current, workflowAttempt: 99 }, 2)
        ).toEqual({ _tag: "Rejected" })
        expect(
          yield* p.resumeScan({ ...current, workflowExecutionId: "other" }, 1)
        ).toEqual({ _tag: "Rejected" })
        expect((yield* p.owned(input, row.id)).status).toBe("failed")
        expect(yield* p.resumeScan(current, 2)).toEqual({ _tag: "Resumed" })
        expect(yield* p.resumeScan(current, 1)).toEqual({
          _tag: "AwaitRetry",
          failureSequence: 2
        })
        expect((yield* p.owned(input, row.id)).status).toBe("scanning")
        yield* p.recordScanFailure(current, "issues/0/2", failure)
        yield* p.claimCleanup(current, {
          mode: "discard",
          executionId: "cleanup",
          expectedRevision: (yield* p.owned(input, row.id)).revision
        })
        expect(yield* p.resumeScan(current, 2)).toEqual({ _tag: "Rejected" })
        expect(
          yield* p.recordScanFailure(current, "issues/0/2", failure)
        ).toBeNull()
      }).pipe(Effect.provide(layer))
    )
  })
  it("merges checkpoint progress and failure receipts atomically under concurrent writes", async () => {
    const input = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const row = yield* p.ensureCreated(input)
        const current = fence(row)
        yield* Effect.all(
          [
            p.recordScanFailure(current, "page/0", {
              reason: "network",
              retryable: true,
              reconnect: false
            }),
            p.advance(current, {
              checkpoint: { scanFailureReceipts: { stale: 99 } }
            }),
            p.recordScanProgress(current, "page1", 5)
          ],
          { concurrency: 3 }
        )
        expect(yield* p.recordScanProgress(current, "page1", 50)).toBe(true)
        yield* p.advance(current, { checkpoint: null })
        const failed = yield* p.owned(input, row.id)
        expect(failed.progressDone).toBe(5)
        expect(failed.checkpoint).toMatchObject({
          scanFailureReceipts: { "page/0": 1 },
          scanPages: { page1: 5 }
        })
        expect(failed.status).toBe("failed")
        yield* p.resumeScan(current, 1)
        expect(
          yield* p.recordScanFailure(current, "page/0", {
            reason: "network",
            retryable: true,
            reconnect: false
          })
        ).toBe(1)
        expect((yield* p.owned(input, row.id)).status).toBe("scanning")
      }).pipe(Effect.provide(layer))
    )
  })
})

const emptyConfiguration = Schema.decodeUnknownSync(JiraMigrationConfiguration)(
  {
    destination: { name: "Application", slug: "application", key: "APP" },
    identities: [],
    statuses: [],
    issueTypes: [],
    priorities: [],
    tags: [],
    activeFutureSprintChoices: [],
    restrictedContent: { policy: "exclude" },
    skippedAttachmentIds: [],
    attachmentSkipsAccepted: false
  }
)
const emptyScan = {
  manifest: {
    key: "manifest.json",
    sha256: "a".repeat(64),
    byteSize: 10,
    contentType: "application/json"
  },
  requirements: Schema.decodeUnknownSync(JiraMigrationRequirements)({
    destination: {
      suggestedName: "Application",
      suggestedSlug: "application",
      suggestedKey: "APP"
    },
    identities: [],
    identityOptions: [],
    statuses: [],
    statusOptions: [],
    issueTypes: [],
    priorities: [],
    tags: [],
    activeFutureSprintChoices: [],
    restrictedContent: { issueCount: 0, commentCount: 0, worklogCount: 0 },
    attachments: []
  }),
  summary: {
    siteName: "Example",
    siteUrl: "https://example.atlassian.net",
    projectName: "Application",
    projectKey: "APP",
    scannedAt: DateTime.makeUnsafe("2026-09-22T00:00:00Z"),
    counts: {
      identities: 0,
      statuses: 0,
      issueTypes: 0,
      priorities: 0,
      tags: 0,
      issues: 0,
      comments: 0,
      attachments: 0,
      groups: 0,
      restrictions: 0
    },
    visibilityWarnings: []
  }
}
