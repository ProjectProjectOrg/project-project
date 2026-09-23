import { randomUUID } from "node:crypto"

import * as BunCrypto from "@effect/platform-bun/BunCrypto"
import { PgClient } from "@effect/sql-pg"
import { DbLive } from "@pp/db"
import { Db } from "@pp/db"
import {
  JiraMigrationConfiguration,
  JiraMigrationRequirements,
  Conflict,
  JiraError
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import {
  DateTime,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Redacted,
  Schedule,
  Schema
} from "effect"
import {
  ClusterWorkflowEngine,
  Sharding,
  Runners,
  RunnerStorage,
  RunnerHealth,
  ShardingConfig,
  SqlMessageStorage
} from "effect/unstable/cluster"
import { SqlClient } from "effect/unstable/sql"
import {
  Activity,
  DurableDeferred,
  WorkflowEngine
} from "effect/unstable/workflow"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { JiraScanFailure } from "./MigrationActivities"
import { JiraArtifactError } from "./MigrationArtifacts"
import {
  JiraMigrationProjection,
  fenceFor,
  type JiraMigrationProjectionShape
} from "./MigrationProjection"
import {
  submitJiraMigrationRun,
  JiraMigrations,
  JiraMigrationsDurableLive,
  type JiraMigrationCleanupCommands,
  type JiraMigrationsShape
} from "./Migrations"
import {
  JiraMigrationWorkflow,
  startImportDeferred,
  retryDeferred,
  makeJiraMigrationWorkflow,
  makeProjectionMigrationActivities,
  runScanUnit
} from "./MigrationWorkflow"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const readyPublication = {
  projectId: "project-1",
  planRef: {
    key: "migrations/jira/test/publication/plan.json",
    contentType: "application/json",
    byteSize: 1,
    sha256: "a".repeat(64)
  },
  verified: {
    planSha256: "a".repeat(64),
    documentCount: 0,
    attachmentCount: 0,
    unresolvedReferenceCount: 0 as const
  }
}
const configuration = Schema.decodeUnknownSync(JiraMigrationConfiguration)({
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
const source = {
  cloudId: "cloud",
  siteName: "Example",
  siteUrl: "https://example.atlassian.net",
  projectId: "1",
  projectKey: "APP",
  projectName: "Application"
}
const scan = {
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

describe.skipIf(!databaseUrl)("atomic Jira durable commands", () => {
  let pool: Pool
  let commandTestLayer: () => Layer.Layer<
    | JiraMigrationProjection
    | SqlClient.SqlClient
    | WorkflowEngine.WorkflowEngine
    | Db
  >
  let owners: ReadonlyArray<
    Readonly<{ organizationId: string; userId: string }>
  > = []
  beforeAll(async () => {
    const url = new URL(databaseUrl!)
    if (
      url.hostname !== "127.0.0.1" ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    )
      throw new Error("Isolated database required")
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: `${import.meta.dirname}/../../../db/src/migrations`
    })
    const pg = PgClient.layer({ url: Redacted.make(databaseUrl!) })
    const projection = JiraMigrationProjection.layer.pipe(
      Layer.provideMerge(DbLive)
    )
    commandTestLayer = () => {
      const storage = SqlMessageStorage.layerWith({
        prefix: `jira_command_${randomUUID().replaceAll("-", "")}`
      })
      const runner = Sharding.layer.pipe(
        Layer.provideMerge(Runners.layerNoop),
        Layer.provideMerge(storage),
        Layer.provide([RunnerStorage.layerMemory, RunnerHealth.layerNoop]),
        Layer.provide(
          ShardingConfig.layerFromEnv({
            shardsPerGroup: 1,
            entityMessagePollInterval: "20 millis",
            entityReplyPollInterval: "20 millis"
          })
        )
      )
      const engine = ClusterWorkflowEngine.layer.pipe(
        Layer.provide(runner),
        Layer.provide(BunCrypto.layer)
      )
      return Layer.mergeAll(projection, engine).pipe(
        Layer.provideMerge(pg),
        Layer.orDie
      )
    }
  })
  afterAll(async () => {
    for (const owner of owners) {
      await pool.query('delete from "organization" where id = $1', [
        owner.organizationId
      ])
      await pool.query('delete from "user" where id = $1', [owner.userId])
    }
    if (pool) await pool.end()
  })
  const fixture = async () => {
    const owner = { organizationId: randomUUID(), userId: randomUUID() }
    owners = [...owners, owner]
    await pool.query(
      'insert into "user" (id,name,email,email_verified,created_at,updated_at) values ($1,$1,$2,false,now(),now())',
      [owner.userId, `${owner.userId}@example.test`]
    )
    await pool.query(
      'insert into "organization" (id,name,slug,created_at) values ($1,$1,$1,now())',
      [owner.organizationId]
    )
    return owner
  }

  const unexpectedCleanup: JiraMigrationCleanupCommands = {
    start: () => Effect.die("Unexpected cleanup start"),
    awaitReset: () => Effect.die("Unexpected reset wait")
  }
  const artifacts = (issueNumbers: ReadonlyArray<number> = []) => ({
    readJson: <A>(_orgSlug: string, _ref: unknown, schema: Schema.Decoder<A>) =>
      Schema.decodeUnknownEffect(schema)({
        issues: issueNumbers.map((issueNumber) => ({ issueNumber }))
      }).pipe(
        Effect.mapError(
          () => new JiraArtifactError({ key: "manifest", reason: "schema" })
        )
      )
  })
  const commandLayer = (
    cleanup = unexpectedCleanup,
    unresolvedFailedAttachmentIds: ReadonlyArray<string> = [],
    issueNumbers: ReadonlyArray<number> = []
  ) =>
    JiraMigrationsDurableLive(
      cleanup,
      {
        unresolvedFailedAttachments: () =>
          Effect.succeed(unresolvedFailedAttachmentIds)
      },
      artifacts(issueNumbers)
    )
  const scanningWorkflow = (
    p: JiraMigrationProjectionShape,
    owner: Readonly<{ organizationId: string; userId: string }>,
    currentScan = scan
  ) =>
    makeJiraMigrationWorkflow(
      makeProjectionMigrationActivities(
        p,
        () => Effect.void,
        ({ executionId }) =>
          p.owned(owner, executionId).pipe(
            Effect.flatMap((row) =>
              p.completeScan(fenceFor(row)!, currentScan)
            ),
            Effect.asVoid,
            Effect.orDie
          ),
        () =>
          DurableDeferred.await(retryDeferred(999)).pipe(
            Effect.as(readyPublication)
          ),
        () => Effect.void
      )
    )
  const createScanned = Effect.fn(function* (
    m: JiraMigrationsShape,
    p: JiraMigrationProjectionShape,
    owner: Readonly<{ organizationId: string; userId: string }>
  ) {
    const created = yield* m.create(
      owner.organizationId,
      owner.userId,
      randomUUID(),
      source
    )
    const scanned = yield* p.owned(owner, created.id).pipe(
      Effect.repeat({
        while: (row) => row.scanAt === null,
        schedule: Schedule.spaced("10 millis")
      }),
      Effect.timeout("5 seconds"),
      Effect.orDie
    )
    return yield* p.toDetail(scanned)
  })

  it("reads exact destination conflicts before starting the migration", async () => {
    const owner = await fixture()
    const existingProjectId = randomUUID()
    await pool.query(
      `insert into project_index (id, slug, organization_id, key, name, icon, color, created_by)
       values ($1, 'application', $2, 'APP', 'Existing', '📁', '#000000', $3)`,
      [existingProjectId, owner.organizationId, owner.userId]
    )
    await pool.query(
      `insert into ticket_index (organization_id, org_slug, project_id, project_slug, ticket_id, title, status, type, priority, created_by, created_at, updated_at)
       values ($1, $2, $3, 'application', 'APP-1', 'Existing ticket', 'todo', 'feat', 'med', $4, now(), now())`,
      [
        owner.organizationId,
        owner.organizationId,
        existingProjectId,
        owner.userId
      ]
    )
    await Effect.runPromise(
      Effect.gen(function* () {
        const projection = yield* JiraMigrationProjection
        yield* Effect.gen(function* () {
          const migrations = yield* JiraMigrations
          const scanned = yield* createScanned(migrations, projection, owner)
          const ready = yield* migrations.configure(
            owner.organizationId,
            owner.userId,
            scanned.id,
            scanned.revision,
            configuration
          )
          expect(
            yield* migrations.destinationConflicts(
              owner.organizationId,
              owner.userId,
              owner.organizationId,
              scanned.id,
              ready.revision
            )
          ).toEqual([
            { kind: "project_slug", value: "application" },
            { kind: "project_key", value: "APP" },
            { kind: "ticket_id", value: "APP-1" }
          ])
          const changed = yield* migrations.configure(
            owner.organizationId,
            owner.userId,
            scanned.id,
            ready.revision,
            yield* Schema.decodeUnknownEffect(JiraMigrationConfiguration)({
              ...configuration,
              destination: {
                ...configuration.destination,
                slug: "new-application",
                key: "NEW"
              }
            })
          )
          expect(
            yield* migrations.destinationConflicts(
              owner.organizationId,
              owner.userId,
              owner.organizationId,
              scanned.id,
              changed.revision
            )
          ).toEqual([])
          const stale = yield* Effect.exit(
            migrations.destinationConflicts(
              owner.organizationId,
              owner.userId,
              owner.organizationId,
              scanned.id,
              scanned.revision
            )
          )
          expect(Exit.isFailure(stale)).toBe(true)
        }).pipe(
          Effect.provide(
            Layer.merge(
              commandLayer(undefined, [], [1]),
              scanningWorkflow(projection, owner)
            )
          )
        )
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)

  it("rolls back the revision and retention when durable signal storage fails", async () => {
    const owner = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const engine = yield* WorkflowEngine.WorkflowEngine
        const sql = yield* SqlClient.SqlClient
        yield* Effect.gen(function* () {
          const m = yield* JiraMigrations
          const created = yield* createScanned(m, p, owner)
          const ready = yield* m.configure(
            owner.organizationId,
            owner.userId,
            created.id,
            created.revision,
            configuration
          )
          const before = yield* p.owned(owner, created.id)
          const result = yield* Effect.exit(
            submitJiraMigrationRun({
              owner,
              migrationId: created.id,
              expectedRevision: ready.revision
            }).pipe(
              Effect.provideService(WorkflowEngine.WorkflowEngine, {
                ...engine,
                deferredDone: () =>
                  Effect.gen(function* () {
                    const accepted = yield* p
                      .owned(owner, created.id)
                      .pipe(Effect.orDie)
                    expect(accepted).toMatchObject({
                      status: "migrating",
                      revision: ready.revision + 1,
                      retainedUntil: null,
                      finishedAt: null
                    })
                    expect(accepted.checkpoint).toMatchObject({
                      acceptedConfiguration: {
                        configurationRevision: ready.revision + 1
                      }
                    })
                    return yield* sql`select 1 / 0`.pipe(
                      Effect.orDie,
                      Effect.asVoid
                    )
                  })
              })
            )
          )
          expect(Exit.isFailure(result)).toBe(true)
          const after = yield* p.owned(owner, created.id)
          expect(after).toMatchObject({
            status: "ready",
            revision: before.revision,
            finishedAt: before.finishedAt,
            retainedUntil: before.retainedUntil,
            checkpoint: before.checkpoint
          })
          yield* submitJiraMigrationRun({
            owner,
            migrationId: created.id,
            expectedRevision: ready.revision
          })
          expect((yield* p.owned(owner, created.id)).status).toBe("migrating")
        }).pipe(
          Effect.provide(
            Layer.merge(commandLayer(), scanningWorkflow(p, owner))
          )
        )
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)

  it("persists whole incomplete drafts and rejects stale configure, run, rescan, and cancel revisions", async () => {
    const owner = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const requiredScan = {
          ...scan,
          requirements: {
            ...scan.requirements,
            issueTypes: [
              {
                jiraIssueTypeId: "bug",
                name: "Bug",
                isSubtask: false,
                suggestedProjectType: "bug" as const
              }
            ]
          }
        }
        yield* Effect.gen(function* () {
          const m = yield* JiraMigrations
          const created = yield* createScanned(m, p, owner)
          const saved = yield* m.configure(
            owner.organizationId,
            owner.userId,
            created.id,
            created.revision,
            configuration
          )
          expect(saved).toMatchObject({
            configuration,
            status: "needs_configuration",
            revision: created.revision + 1
          })
          expect(
            yield* Effect.result(
              m.run(
                owner.organizationId,
                owner.userId,
                created.id,
                saved.revision
              )
            )
          ).toMatchObject({ _tag: "Failure", failure: { _tag: "Validation" } })
          const complete = {
            ...configuration,
            issueTypes: [
              { jiraIssueTypeId: "bug", projectType: "bug" as const }
            ]
          }
          const ready = yield* m.configure(
            owner.organizationId,
            owner.userId,
            created.id,
            saved.revision,
            complete
          )
          expect(ready).toMatchObject({
            status: "ready",
            configuration: complete,
            revision: saved.revision + 1
          })
          for (const stale of [
            m.configure(
              owner.organizationId,
              owner.userId,
              created.id,
              saved.revision,
              configuration
            ),
            m.run(
              owner.organizationId,
              owner.userId,
              created.id,
              saved.revision
            ),
            m.rescan(
              owner.organizationId,
              owner.userId,
              created.id,
              saved.revision
            ),
            m.cancel(
              owner.organizationId,
              owner.userId,
              created.id,
              saved.revision
            )
          ])
            expect(yield* Effect.result(stale)).toMatchObject({
              _tag: "Failure",
              failure: { _tag: "Conflict" }
            })
          expect((yield* p.owned(owner, created.id)).revision).toBe(
            ready.revision
          )
        }).pipe(
          Effect.provide(
            Layer.merge(
              commandLayer(),
              scanningWorkflow(p, owner, requiredScan)
            )
          )
        )
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)

  it("returns fresh detail after bounded observation without interrupting import work", async () => {
    const owner = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const entered = yield* Deferred.make<void>()
        const observationEntered = yield* Deferred.make<void>()
        let held = false
        const observing: JiraMigrationProjectionShape = {
          ...p,
          owned: (requestedOwner, id) =>
            p.owned(requestedOwner, id).pipe(
              Effect.flatMap((row) => {
                if (row.status !== "migrating" || held)
                  return Effect.succeed(row)
                held = true
                return Deferred.succeed(observationEntered, undefined).pipe(
                  Effect.andThen(Effect.never)
                )
              })
            )
        }
        const finalized = yield* Deferred.make<void>()
        const workflow = makeJiraMigrationWorkflow(
          makeProjectionMigrationActivities(
            p,
            () => Deferred.succeed(finalized, undefined).pipe(Effect.asVoid),
            ({ executionId }) =>
              p.owned(owner, executionId).pipe(
                Effect.flatMap((row) => p.completeScan(fenceFor(row)!, scan)),
                Effect.asVoid,
                Effect.orDie
              ),
            () =>
              Deferred.succeed(entered, undefined).pipe(
                Effect.andThen(DurableDeferred.await(retryDeferred(999))),
                Effect.as(readyPublication)
              ),
            () => Effect.void
          )
        )
        yield* Effect.gen(function* () {
          const m = yield* JiraMigrations
          const created = yield* createScanned(m, p, owner)
          const ready = yield* m.configure(
            owner.organizationId,
            owner.userId,
            created.id,
            created.revision,
            configuration
          )
          const request = yield* m
            .run(owner.organizationId, owner.userId, created.id, ready.revision)
            .pipe(Effect.forkChild)
          yield* Deferred.await(observationEntered)
          const accepted = yield* p.owned(owner, created.id)
          yield* p.advance(fenceFor(accepted)!, { progressDone: 37 })
          const running = yield* Fiber.join(request)
          expect(running).toMatchObject({
            status: "migrating",
            revision: ready.revision + 2,
            progress: { done: 37 }
          })
          expect(yield* Deferred.isDone(entered)).toBe(true)
          expect(yield* Deferred.isDone(finalized)).toBe(false)
          const cancelled = yield* m.cancel(
            owner.organizationId,
            owner.userId,
            created.id,
            running.revision
          )
          expect(cancelled.status).toBe("cancelled")
          const row = yield* p.owned(owner, created.id)
          expect(row.retainedUntil!.getTime() - row.finishedAt!.getTime()).toBe(
            30 * 24 * 60 * 60 * 1000
          )
          yield* Deferred.await(finalized).pipe(Effect.timeout("5 seconds"))
        }).pipe(
          Effect.provide(
            Layer.merge(
              commandLayer().pipe(
                Layer.provide(Layer.succeed(JiraMigrationProjection, observing))
              ),
              workflow
            )
          )
        )
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)

  it("uses fresh import retry gates for corrected configuration and preserves accepted snapshots on operational retry", async () => {
    const owner = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const firstFailure = yield* Deferred.make<void>()
        const secondFailure = yield* Deferred.make<void>()
        const finished = yield* Deferred.make<void>()
        const workflow = makeJiraMigrationWorkflow(
          makeProjectionMigrationActivities(
            p,
            () => Effect.void,
            ({ executionId }) =>
              p.owned(owner, executionId).pipe(
                Effect.flatMap((row) => p.completeScan(fenceFor(row)!, scan)),
                Effect.asVoid,
                Effect.orDie
              ),
            ({ executionId }) =>
              Effect.gen(function* () {
                const row = yield* p
                  .owned(owner, executionId)
                  .pipe(Effect.orDie)
                yield* Activity.make({
                  name: "test/configuration-failure",
                  success: Schema.Boolean,
                  execute: p
                    .recordFailure(fenceFor(row)!, {
                      reason: "configuration_blocked",
                      retryable: false
                    })
                    .pipe(Effect.orDie)
                })
                yield* Deferred.succeed(firstFailure, undefined)
                yield* DurableDeferred.await(retryDeferred(1))
                yield* Activity.make({
                  name: "test/reconnect-failure",
                  success: Schema.Boolean,
                  execute: p
                    .recordFailure(fenceFor(row)!, {
                      reason: "reconnect_required",
                      retryable: true,
                      status: "reconnect_required"
                    })
                    .pipe(Effect.orDie)
                })
                yield* Deferred.succeed(secondFailure, undefined)
                yield* DurableDeferred.await(retryDeferred(2))
                yield* Deferred.succeed(finished, undefined)
                return readyPublication
              }),
            () => Effect.void
          )
        )
        yield* Effect.gen(function* () {
          const m = yield* JiraMigrations
          const created = yield* createScanned(m, p, owner)
          const ready = yield* m.configure(
            owner.organizationId,
            owner.userId,
            created.id,
            created.revision,
            configuration
          )
          yield* m.run(
            owner.organizationId,
            owner.userId,
            created.id,
            ready.revision
          )
          yield* Deferred.await(firstFailure)
          const failed = yield* p.owned(owner, created.id)
          expect(
            yield* Effect.result(
              m.run(
                owner.organizationId,
                owner.userId,
                created.id,
                failed.revision
              )
            )
          ).toMatchObject({ _tag: "Failure", failure: { _tag: "Validation" } })
          const corrected = {
            ...configuration,
            destination: { ...configuration.destination, name: "Corrected" }
          }
          const saved = yield* m.configure(
            owner.organizationId,
            owner.userId,
            created.id,
            failed.revision,
            corrected
          )
          yield* m.run(
            owner.organizationId,
            owner.userId,
            created.id,
            saved.revision
          )
          yield* Deferred.await(secondFailure).pipe(Effect.timeout("5 seconds"))
          const reconnect = yield* p.owned(owner, created.id)
          expect(reconnect).toMatchObject({
            status: "reconnect_required",
            failureSequence: 2
          })
          expect(reconnect.checkpoint).toMatchObject({
            acceptedConfiguration: {
              configurationRevision: saved.revision + 1,
              configuration: corrected
            }
          })
          yield* m.run(
            owner.organizationId,
            owner.userId,
            created.id,
            reconnect.revision
          )
          yield* Deferred.await(finished).pipe(Effect.timeout("5 seconds"))
          const current = yield* p.owned(owner, created.id)
          expect(current).toMatchObject({
            workflowExecutionId: reconnect.workflowExecutionId,
            retainedUntil: null,
            finishedAt: null
          })
          expect(current.checkpoint).toMatchObject({
            acceptedConfiguration: {
              configurationRevision: saved.revision + 1,
              configuration: corrected
            }
          })
        }).pipe(Effect.provide(Layer.merge(commandLayer(), workflow)))
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)

  it("limits hidden-import edits to explicit currently failed attachment additions", async () => {
    const owner = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const attachmentScan = {
          ...scan,
          requirements: {
            ...scan.requirements,
            attachments: ["old", "failed", "healthy"].map((id) => ({
              jiraAttachmentId: id,
              filename: id,
              byteSize: 1,
              forcedSkipReason: null
            }))
          }
        }
        yield* Effect.gen(function* () {
          const m = yield* JiraMigrations
          const created = yield* createScanned(m, p, owner)
          const accepted = {
            ...configuration,
            skippedAttachmentIds: ["old"],
            attachmentSkipsAccepted: true
          }
          const ready = yield* m.configure(
            owner.organizationId,
            owner.userId,
            created.id,
            created.revision,
            accepted
          )
          yield* submitJiraMigrationRun({
            owner,
            migrationId: created.id,
            expectedRevision: ready.revision
          })
          const row = yield* p.owned(owner, created.id)
          yield* p.advance(fenceFor(row)!, {
            destinationProjectId: randomUUID(),
            destinationProjectSlug: "application"
          })
          yield* p.recordFailure(fenceFor(row)!, {
            reason: "attachment_failed",
            retryable: true
          })
          const failed = yield* p.owned(owner, created.id)
          const corrected = {
            ...accepted,
            skippedAttachmentIds: ["old", "failed"]
          }
          for (const invalid of [
            {
              ...corrected,
              destination: { ...corrected.destination, name: "Changed" }
            },
            { ...corrected, skippedAttachmentIds: ["old", "healthy"] },
            { ...corrected, skippedAttachmentIds: ["failed"] },
            { ...corrected, attachmentSkipsAccepted: false }
          ])
            expect(
              yield* Effect.result(
                m.configure(
                  owner.organizationId,
                  owner.userId,
                  created.id,
                  failed.revision,
                  invalid
                )
              )
            ).toMatchObject({
              _tag: "Failure",
              failure: { _tag: "Validation" }
            })
          expect((yield* p.owned(owner, created.id)).configuration).toEqual(
            accepted
          )
          const saved = yield* m.configure(
            owner.organizationId,
            owner.userId,
            created.id,
            failed.revision,
            corrected
          )
          expect(saved).toMatchObject({
            status: "ready",
            configuration: corrected
          })
          expect((yield* p.owned(owner, created.id)).checkpoint).toMatchObject({
            acceptedConfiguration: { configuration: accepted },
            currentGate: { _tag: "Retry", failureSequence: 1 }
          })
        }).pipe(
          Effect.provide(
            Layer.merge(
              commandLayer(unexpectedCleanup, ["failed"]),
              scanningWorkflow(p, owner, attachmentScan)
            )
          )
        )
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)

  it("retains the cleanup recovery handle and reports submission failure distinctly", async () => {
    const owner = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const cleanup: JiraMigrationCleanupCommands = {
          start: (input) =>
            Effect.gen(function* () {
              const claim = {
                expectedRevision: input.expectedRevision,
                executionId: "cleanup-recovery",
                mode: "discard" as const
              }
              const accepted = yield* p.claimCleanup(input, claim)
              if (!accepted)
                return yield* new Conflict({ reason: "lost_cleanup" })
              return yield* new JiraError({ reason: "server_error" })
            }),
          awaitReset: unexpectedCleanup.awaitReset
        }
        yield* Effect.gen(function* () {
          const m = yield* JiraMigrations
          const created = yield* createScanned(m, p, owner)
          const row = yield* p.owned(owner, created.id)
          yield* p.recordFailure(fenceFor(row)!, {
            reason: "failed",
            retryable: true
          })
          expect(
            yield* Effect.result(
              m.discard(owner.organizationId, owner.userId, created.id)
            )
          ).toMatchObject({
            _tag: "Failure",
            failure: {
              _tag: "Validation",
              reason: "jira_migration_cleanup_failed"
            }
          })
          const retained = yield* p.owned(owner, created.id)
          expect(retained.cleanupExecutionId).toBe("cleanup-recovery")
          expect(retained.retainedUntil).not.toBeNull()
          expect(
            yield* Effect.result(
              m.discard(owner.organizationId, owner.userId, created.id)
            )
          ).toMatchObject({
            _tag: "Failure",
            failure: {
              _tag: "Validation",
              reason: "jira_migration_discard_not_allowed"
            }
          })
        }).pipe(
          Effect.provide(
            Layer.merge(commandLayer(cleanup), scanningWorkflow(p, owner))
          )
        )
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)

  it("rejects discard while an attachment write can still finish", async () => {
    const owner = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        yield* Effect.gen(function* () {
          const m = yield* JiraMigrations
          const created = yield* createScanned(m, p, owner)
          const row = yield* p.owned(owner, created.id)
          const current = fenceFor(row)!
          expect(
            yield* p.advance(current, { status: "migrating", phase: "import" })
          ).toBe(true)
          expect(yield* p.beginRemoteWrites(current)).toBe(true)
          yield* p.recordFailure(current, {
            reason: "ambiguous_upload",
            retryable: true
          })
          expect(
            yield* Effect.result(
              m.discard(owner.organizationId, owner.userId, created.id)
            )
          ).toMatchObject({
            _tag: "Failure",
            failure: {
              _tag: "Validation",
              reason: "jira_migration_discard_not_allowed"
            }
          })
        }).pipe(
          Effect.provide(
            Layer.merge(commandLayer(), scanningWorkflow(p, owner))
          )
        )
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)

  it.each(["ready", "reconnect_required"] as const)(
    "waits for verified hidden %s reset and installs the returned revision once",
    async (status) => {
      const owner = await fixture()
      await Effect.runPromise(
        Effect.gen(function* () {
          const p = yield* JiraMigrationProjection
          const cleanupStarted = yield* Deferred.make<void>()
          const removeHidden = yield* Deferred.make<void>()
          const newScan = yield* Deferred.make<void>()
          const attachmentScan = {
            ...scan,
            requirements: {
              ...scan.requirements,
              attachments: ["old", "failed"].map((id) => ({
                jiraAttachmentId: id,
                filename: id,
                byteSize: 1,
                forcedSkipReason: null
              }))
            }
          }
          const cleanup: JiraMigrationCleanupCommands = {
            start: (input) =>
              Effect.gen(function* () {
                expect(input.mode).toBe("reset_import")
                const executionId = `reset:${input.migrationId}:${input.expectedRevision + 1}`
                if (!(yield* p.claimCleanup(input, { ...input, executionId })))
                  return yield* new Conflict({ reason: "lost_reset" })
                yield* Deferred.succeed(cleanupStarted, undefined)
                return executionId
              }),
            awaitReset: (input) =>
              Effect.gen(function* () {
                yield* Deferred.await(removeHidden)
                const removed = yield* Effect.promise(() =>
                  pool.query(
                    "update jira_migration set destination_project_id = null, destination_project_slug = null where id = $1 and workflow_execution_id = $2 and workflow_attempt = $3 and cleanup_execution_id = $4 returning id",
                    [
                      input.migrationId,
                      input.workflowExecutionId,
                      input.workflowAttempt,
                      input.cleanupExecutionId
                    ]
                  )
                )
                expect(removed.rowCount).toBe(1)
                expect(
                  yield* p.releaseCleanup(
                    input,
                    input.cleanupExecutionId,
                    input.mode
                  )
                ).toBe(true)
                const current = yield* p.owned(owner, input.migrationId)
                return { fence: fenceFor(current)!, revision: current.revision }
              })
          }
          const workflow = makeJiraMigrationWorkflow(
            makeProjectionMigrationActivities(
              p,
              () => Effect.void,
              ({ payload, executionId }) =>
                Effect.gen(function* () {
                  if (payload.command._tag === "Rescan")
                    return yield* Deferred.await(newScan)
                  const row = yield* p
                    .owned(owner, executionId)
                    .pipe(Effect.orDie)
                  yield* p
                    .completeScan(fenceFor(row)!, attachmentScan)
                    .pipe(Effect.orDie)
                }),
              () =>
                DurableDeferred.await(retryDeferred(999)).pipe(
                  Effect.as(readyPublication)
                ),
              () => Effect.void
            )
          )
          yield* Effect.gen(function* () {
            const m = yield* JiraMigrations
            const created = yield* createScanned(m, p, owner)
            const accepted = {
              ...configuration,
              skippedAttachmentIds: ["old"],
              attachmentSkipsAccepted: true
            }
            const ready = yield* m.configure(
              owner.organizationId,
              owner.userId,
              created.id,
              created.revision,
              accepted
            )
            yield* submitJiraMigrationRun({
              owner,
              migrationId: created.id,
              expectedRevision: ready.revision
            })
            const running = yield* p.owned(owner, created.id)
            yield* p.advance(fenceFor(running)!, {
              destinationProjectId: randomUUID(),
              destinationProjectSlug: "application"
            })
            yield* p.recordFailure(fenceFor(running)!, {
              reason: "attachment_failed",
              retryable: true,
              status: status === "ready" ? "failed" : "reconnect_required"
            })
            let current = yield* p.owned(owner, created.id)
            if (status === "ready") {
              yield* m.configure(
                owner.organizationId,
                owner.userId,
                created.id,
                current.revision,
                { ...accepted, skippedAttachmentIds: ["old", "failed"] }
              )
              current = yield* p.owned(owner, created.id)
            }
            expect(current.status).toBe(status)
            const request = yield* m
              .rescan(
                owner.organizationId,
                owner.userId,
                created.id,
                current.revision
              )
              .pipe(Effect.forkChild)
            yield* Deferred.await(cleanupStarted)
            const claimed = yield* p.owned(owner, created.id)
            expect(claimed).toMatchObject({
              workflowExecutionId: current.workflowExecutionId,
              workflowAttempt: current.workflowAttempt,
              revision: current.revision + 1
            })
            expect(claimed.destinationProjectId).not.toBeNull()
            expect(
              yield* Effect.result(
                m.run(
                  owner.organizationId,
                  owner.userId,
                  created.id,
                  claimed.revision
                )
              )
            ).toMatchObject({
              _tag: "Failure",
              failure: { _tag: "Validation" }
            })
            expect(
              yield* Effect.result(
                m.discard(owner.organizationId, owner.userId, created.id)
              )
            ).toMatchObject({
              _tag: "Failure",
              failure: {
                _tag: "Validation",
                reason: "jira_migration_discard_not_allowed"
              }
            })
            yield* Deferred.succeed(removeHidden, undefined)
            const rescanned = yield* Fiber.join(request)
            expect(rescanned).toMatchObject({
              status: "scanning",
              configuration: null,
              revision: current.revision + 3
            })
            const installed = yield* p.owned(owner, created.id)
            expect(installed).toMatchObject({
              workflowAttempt: current.workflowAttempt + 1,
              scanRevision: current.scanRevision + 1,
              cleanupExecutionId: null,
              destinationProjectId: null,
              checkpoint: null
            })
            expect(installed.workflowExecutionId).not.toBe(
              current.workflowExecutionId
            )
            expect(
              yield* p.advance(fenceFor(current)!, { status: "succeeded" })
            ).toBe(false)
            expect(yield* p.finalizeInterrupted(fenceFor(current)!)).toBe(false)
            yield* Deferred.succeed(newScan, undefined)
            yield* JiraMigrationWorkflow.poll(
              installed.workflowExecutionId!
            ).pipe(
              Effect.repeat({
                while: (result) =>
                  Option.isNone(result) || result.value._tag !== "Suspended",
                schedule: Schedule.spaced("10 millis")
              }),
              Effect.timeout("5 seconds")
            )
          }).pipe(
            Effect.provide(
              Layer.merge(commandLayer(cleanup, ["failed"]), workflow)
            )
          )
        }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
      )
    },
    20000
  )

  it("rejects a reset completion whose returned revision lost to another command", async () => {
    const owner = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const cleanup: JiraMigrationCleanupCommands = {
          start: (input) =>
            Effect.gen(function* () {
              if (
                !(yield* p.claimCleanup(input, {
                  ...input,
                  executionId: "reset-race"
                }))
              )
                return yield* new Conflict({ reason: "lost_reset" })
              return "reset-race"
            }),
          awaitReset: (input) =>
            Effect.gen(function* () {
              yield* Effect.promise(() =>
                pool.query(
                  "update jira_migration set destination_project_id = null where id = $1 and cleanup_execution_id = $2",
                  [input.migrationId, input.cleanupExecutionId]
                )
              )
              expect(
                yield* p.releaseCleanup(
                  input,
                  input.cleanupExecutionId,
                  input.mode
                )
              ).toBe(true)
              const reset = yield* p.owned(owner, input.migrationId)
              yield* p.saveConfiguration({
                owner,
                migrationId: input.migrationId,
                expectedRevision: reset.revision,
                configuration
              })
              return { fence: fenceFor(reset)!, revision: reset.revision }
            })
        }
        yield* Effect.gen(function* () {
          const m = yield* JiraMigrations
          const created = yield* createScanned(m, p, owner)
          const ready = yield* m.configure(
            owner.organizationId,
            owner.userId,
            created.id,
            created.revision,
            configuration
          )
          yield* submitJiraMigrationRun({
            owner,
            migrationId: created.id,
            expectedRevision: ready.revision
          })
          const running = yield* p.owned(owner, created.id)
          yield* p.advance(fenceFor(running)!, {
            destinationProjectId: randomUUID()
          })
          yield* p.recordFailure(fenceFor(running)!, {
            reason: "failed",
            retryable: true
          })
          const failed = yield* p.owned(owner, created.id)
          expect(
            yield* Effect.result(
              m.rescan(
                owner.organizationId,
                owner.userId,
                created.id,
                failed.revision
              )
            )
          ).toMatchObject({ _tag: "Failure", failure: { _tag: "Conflict" } })
          const current = yield* p.owned(owner, created.id)
          expect(current).toMatchObject({
            workflowExecutionId: running.workflowExecutionId,
            workflowAttempt: 1,
            scanRevision: 1,
            configuration,
            status: "ready",
            cleanupExecutionId: null
          })
        }).pipe(
          Effect.provide(
            Layer.merge(commandLayer(cleanup), scanningWorkflow(p, owner))
          )
        )
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)

  it("rejects attachment corrections when the materialization lookup loses the revision fence", async () => {
    const owner = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const lookup = yield* Deferred.make<void>()
        const releaseLookup = yield* Deferred.make<void>()
        const attachmentScan = {
          ...scan,
          requirements: {
            ...scan.requirements,
            attachments: [
              {
                jiraAttachmentId: "failed",
                filename: "failed",
                byteSize: 1,
                forcedSkipReason: null
              }
            ]
          }
        }
        const layer = JiraMigrationsDurableLive(
          unexpectedCleanup,
          {
            unresolvedFailedAttachments: (input) =>
              Effect.gen(function* () {
                const current = yield* p.owned(owner, input.migrationId)
                expect(input).toEqual({
                  ...fenceFor(current)!,
                  expectedRevision: current.revision
                })
                yield* Deferred.succeed(lookup, undefined)
                yield* Deferred.await(releaseLookup)
                return ["failed"]
              })
          },
          artifacts()
        )
        yield* Effect.gen(function* () {
          const m = yield* JiraMigrations
          const created = yield* createScanned(m, p, owner)
          const ready = yield* m.configure(
            owner.organizationId,
            owner.userId,
            created.id,
            created.revision,
            configuration
          )
          yield* submitJiraMigrationRun({
            owner,
            migrationId: created.id,
            expectedRevision: ready.revision
          })
          const running = yield* p.owned(owner, created.id)
          yield* p.advance(fenceFor(running)!, {
            destinationProjectId: randomUUID()
          })
          yield* p.recordFailure(fenceFor(running)!, {
            reason: "attachment_failed",
            retryable: true
          })
          const failed = yield* p.owned(owner, created.id)
          const pending = yield* m
            .configure(
              owner.organizationId,
              owner.userId,
              created.id,
              failed.revision,
              {
                ...configuration,
                skippedAttachmentIds: ["failed"],
                attachmentSkipsAccepted: true
              }
            )
            .pipe(Effect.result, Effect.forkChild)
          yield* Deferred.await(lookup)
          const cancelled = yield* m.cancel(
            owner.organizationId,
            owner.userId,
            created.id,
            failed.revision
          )
          yield* Deferred.succeed(releaseLookup, undefined)
          expect(yield* Fiber.join(pending)).toMatchObject({
            _tag: "Failure",
            failure: { _tag: "Conflict" }
          })
          const current = yield* p.owned(owner, created.id)
          expect(current).toMatchObject({
            revision: cancelled.revision,
            status: "cancelled",
            configuration
          })
        }).pipe(
          Effect.provide(
            Layer.merge(layer, scanningWorkflow(p, owner, attachmentScan))
          )
        )
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)

  it("accepts a scan retry while the real failure Activity has not returned to its deferred wait", async () => {
    const owner = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const engine = yield* WorkflowEngine.WorkflowEngine
        let trace: ReadonlyArray<string> = []
        const tracing: WorkflowEngine.WorkflowEngine["Service"] = {
          ...engine,
          deferredResult: (deferred) =>
            engine.deferredResult(deferred).pipe(
              Effect.tap((result) =>
                Effect.sync(() => {
                  trace = [...trace, `${deferred.name}:${result._tag}`]
                })
              )
            )
        }
        const failureVisible = yield* Deferred.make<void>()
        const finishFailure = yield* Deferred.make<void>()
        const completed = yield* Deferred.make<void>()
        const workflow = makeJiraMigrationWorkflow(
          makeProjectionMigrationActivities(
            p,
            () => Effect.void,
            ({ executionId }) =>
              Effect.gen(function* () {
                const row = yield* p
                  .owned(owner, executionId)
                  .pipe(Effect.orDie)
                const context = {
                  ...fenceFor(row)!,
                  scanRevision: 1,
                  orgSlug: owner.organizationId,
                  userId: owner.userId,
                  cloudId: source.cloudId,
                  projectId: source.projectId,
                  siteName: source.siteName,
                  siteUrl: source.siteUrl,
                  scannedAt: "2026-09-22T00:00:00Z"
                }
                yield* runScanUnit(
                  context,
                  {
                    recordFailure: (fence, operationKey, failure) =>
                      Effect.gen(function* () {
                        const sequence = yield* p.recordScanFailure(
                          fence,
                          operationKey,
                          failure
                        )
                        yield* Deferred.succeed(failureVisible, undefined)
                        yield* Deferred.await(finishFailure)
                        return sequence
                      }),
                    resume: (fence, sequence) =>
                      p.resumeScan(fence, sequence).pipe(
                        Effect.tap((result) =>
                          Effect.sync(() => {
                            trace = [...trace, `resume:${result._tag}`]
                          })
                        )
                      )
                  },
                  "test/early-retry",
                  (operationTry) =>
                    Activity.make({
                      name: `test/early-retry/${operationTry}`,
                      success: Schema.Void,
                      error: JiraScanFailure,
                      execute:
                        operationTry === 0
                          ? Effect.fail(
                              new JiraScanFailure({
                                reason: "network",
                                retryable: true,
                                reconnect: false
                              })
                            )
                          : Effect.void
                    })
                ).pipe(
                  Effect.provideService(WorkflowEngine.WorkflowEngine, tracing),
                  Effect.orDie
                )
                yield* p.completeScan(fenceFor(row)!, scan).pipe(Effect.orDie)
                yield* Deferred.succeed(completed, undefined)
              }),
            () => Effect.succeed(readyPublication),
            () => Effect.void
          )
        )
        yield* Effect.gen(function* () {
          const m = yield* JiraMigrations
          const created = yield* m.create(
            owner.organizationId,
            owner.userId,
            randomUUID(),
            source
          )
          yield* Deferred.await(failureVisible)
          const failed = yield* p.owned(owner, created.id)
          expect(failed.status).toBe("failed")
          yield* submitJiraMigrationRun({
            owner,
            migrationId: created.id,
            expectedRevision: failed.revision
          })
          expect((yield* p.owned(owner, created.id)).status).toBe("scanning")
          yield* Deferred.succeed(finishFailure, undefined)
          yield* Deferred.await(completed).pipe(
            Effect.timeout("5 seconds"),
            Effect.catchTag("TimeoutError", () =>
              Effect.gen(function* () {
                const state = yield* JiraMigrationWorkflow.poll(created.id)
                return yield* Effect.die({
                  reason: "Early retry did not continue",
                  state,
                  trace
                })
              })
            )
          )
          expect((yield* p.owned(owner, created.id)).status).toBe(
            "needs_configuration"
          )
          yield* JiraMigrationWorkflow.poll(created.id).pipe(
            Effect.repeat({
              while: (result) =>
                Option.isNone(result) || result.value._tag !== "Suspended",
              schedule: Schedule.spaced("10 millis")
            }),
            Effect.timeout("5 seconds")
          )
        }).pipe(Effect.provide(Layer.merge(commandLayer(), workflow)))
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)

  it.each(["retry", "discard"] as const)(
    "allows only %s to win the shared retry/discard revision",
    async (winner) => {
      const owner = await fixture()
      await Effect.runPromise(
        Effect.gen(function* () {
          const p = yield* JiraMigrationProjection
          const failedSignal = yield* Deferred.make<void>()
          const retried = yield* Deferred.make<void>()
          const cleanupEntered = yield* Deferred.make<void>()
          const allowCleanup = yield* Deferred.make<void>()
          const runRead = yield* Deferred.make<void>()
          const allowRun = yield* Deferred.make<void>()
          const cleanup: JiraMigrationCleanupCommands = {
            start: (input) =>
              Effect.gen(function* () {
                expect(input.mode).toBe("discard")
                yield* Deferred.succeed(cleanupEntered, undefined)
                yield* Deferred.await(allowCleanup)
                if (
                  !(yield* p.claimCleanup(input, {
                    ...input,
                    executionId: "discard-race"
                  }))
                )
                  return yield* new Conflict({ reason: "lost_discard" })
                return "discard-race"
              }),
            awaitReset: unexpectedCleanup.awaitReset
          }
          const workflow = makeJiraMigrationWorkflow(
            makeProjectionMigrationActivities(
              p,
              () => Effect.void,
              ({ executionId }) =>
                Effect.gen(function* () {
                  const row = yield* p
                    .owned(owner, executionId)
                    .pipe(Effect.orDie)
                  const context = {
                    ...fenceFor(row)!,
                    scanRevision: 1,
                    orgSlug: owner.organizationId,
                    userId: owner.userId,
                    cloudId: source.cloudId,
                    projectId: source.projectId,
                    siteName: source.siteName,
                    siteUrl: source.siteUrl,
                    scannedAt: "2026-09-22T00:00:00Z"
                  }
                  yield* runScanUnit(
                    context,
                    {
                      recordFailure: (fence, key, failure) =>
                        p
                          .recordScanFailure(fence, key, failure)
                          .pipe(
                            Effect.tap(() =>
                              Deferred.succeed(failedSignal, undefined)
                            )
                          ),
                      resume: p.resumeScan
                    },
                    "test/race-scan",
                    (operationTry) =>
                      Activity.make({
                        name: `test/race-scan/${operationTry}`,
                        success: Schema.Void,
                        error: JiraScanFailure,
                        execute:
                          operationTry === 0
                            ? Effect.fail(
                                new JiraScanFailure({
                                  reason: "network",
                                  retryable: true,
                                  reconnect: false
                                })
                              )
                            : Effect.void
                      })
                  ).pipe(Effect.orDie)
                  yield* Deferred.succeed(retried, undefined)
                }),
              () => Effect.succeed(readyPublication),
              () => Effect.void
            )
          )
          yield* Effect.gen(function* () {
            const m = yield* JiraMigrations
            const created = yield* m.create(
              owner.organizationId,
              owner.userId,
              randomUUID(),
              source
            )
            yield* Deferred.await(failedSignal)
            const failed = yield* p.owned(owner, created.id)
            yield* p.settleRemoteWrites(fenceFor(failed)!)
            const held: JiraMigrationProjectionShape = {
              ...p,
              owned: (requestedOwner, id) =>
                p.owned(requestedOwner, id).pipe(
                  Effect.tap(() => Deferred.succeed(runRead, undefined)),
                  Effect.tap(() => Deferred.await(allowRun))
                )
            }
            const discard = yield* m
              .discard(owner.organizationId, owner.userId, created.id)
              .pipe(Effect.result, Effect.forkChild)
            yield* Deferred.await(cleanupEntered)
            const retry = yield* submitJiraMigrationRun({
              owner,
              migrationId: created.id,
              expectedRevision: failed.revision
            }).pipe(
              Effect.provideService(JiraMigrationProjection, held),
              Effect.result,
              Effect.forkChild
            )
            yield* Deferred.await(runRead)
            if (winner === "retry") {
              yield* Deferred.succeed(allowRun, undefined)
              expect(yield* Fiber.join(retry)).toMatchObject({
                _tag: "Success"
              })
              yield* Deferred.succeed(allowCleanup, undefined)
              expect(yield* Fiber.join(discard)).toMatchObject({
                _tag: "Failure",
                failure: {
                  _tag: "Validation",
                  reason: "jira_migration_discard_not_allowed"
                }
              })
              yield* Deferred.await(retried).pipe(
                Effect.timeout("5 seconds"),
                Effect.catchTag("TimeoutError", () =>
                  Effect.gen(function* () {
                    const state = yield* JiraMigrationWorkflow.poll(
                      failed.workflowExecutionId!
                    )
                    const row = yield* p.owned(owner, created.id)
                    return yield* Effect.die({
                      reason: "Retry gate did not release",
                      state,
                      checkpoint: row.checkpoint
                    })
                  })
                )
              )
            } else {
              yield* Deferred.succeed(allowCleanup, undefined)
              expect(yield* Fiber.join(discard)).toMatchObject({
                _tag: "Success"
              })
              yield* Deferred.succeed(allowRun, undefined)
              expect(yield* Fiber.join(retry)).toMatchObject({
                _tag: "Failure",
                failure: { _tag: "Conflict" }
              })
              expect(yield* Deferred.isDone(retried)).toBe(false)
            }
            const current = yield* p.owned(owner, created.id)
            expect(current).toMatchObject({
              workflowExecutionId: failed.workflowExecutionId,
              workflowAttempt: 1,
              revision: failed.revision + 1,
              status: winner === "retry" ? "scanning" : "failed",
              cleanupExecutionId: winner === "retry" ? null : "discard-race"
            })
            if (winner === "retry") expect(current.retainedUntil).toBeNull()
            else expect(current.retainedUntil).toEqual(failed.retainedUntil)
            yield* JiraMigrationWorkflow.poll(
              current.workflowExecutionId!
            ).pipe(
              Effect.repeat({
                while: (result) =>
                  Option.isNone(result) || result.value._tag !== "Suspended",
                schedule: Schedule.spaced("10 millis")
              }),
              Effect.timeout("5 seconds")
            )
          }).pipe(Effect.provide(Layer.merge(commandLayer(cleanup), workflow)))
        }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
      )
    },
    20000
  )

  it.each(["cancel", "publish"] as const)(
    "preserves only the %s winner against cancellation finalization",
    async (winner) => {
      const owner = await fixture()
      await Effect.runPromise(
        Effect.gen(function* () {
          const p = yield* JiraMigrationProjection
          const cancelRead = yield* Deferred.make<void>()
          const allowCancel = yield* Deferred.make<void>()
          const publishRead = yield* Deferred.make<void>()
          const allowPublish = yield* Deferred.make<void>()
          let interceptCancel = false
          const held: JiraMigrationProjectionShape = {
            ...p,
            owned: (requestedOwner, id) =>
              p.owned(requestedOwner, id).pipe(
                Effect.tap(() => {
                  if (!interceptCancel) return Effect.void
                  interceptCancel = false
                  return Deferred.succeed(cancelRead, undefined).pipe(
                    Effect.andThen(Deferred.await(allowCancel))
                  )
                })
              )
          }
          const commands = commandLayer().pipe(
            Layer.provide(Layer.succeed(JiraMigrationProjection, held))
          )
          yield* Effect.gen(function* () {
            const m = yield* JiraMigrations
            const created = yield* createScanned(m, p, owner)
            const ready = yield* m.configure(
              owner.organizationId,
              owner.userId,
              created.id,
              created.revision,
              configuration
            )
            yield* submitJiraMigrationRun({
              owner,
              migrationId: created.id,
              expectedRevision: ready.revision
            })
            const running = yield* p.owned(owner, created.id)
            interceptCancel = true
            const cancel = yield* m
              .cancel(
                owner.organizationId,
                owner.userId,
                created.id,
                running.revision
              )
              .pipe(Effect.result, Effect.forkChild)
            yield* Deferred.await(cancelRead)
            const publish = yield* Effect.gen(function* () {
              const current = yield* p.owned(owner, created.id)
              yield* Deferred.succeed(publishRead, undefined)
              yield* Deferred.await(allowPublish)
              return yield* p.advance(fenceFor(current)!, {
                status: "succeeded",
                phase: "complete"
              })
            }).pipe(Effect.forkChild)
            yield* Deferred.await(publishRead)
            if (winner === "cancel") {
              yield* Deferred.succeed(allowCancel, undefined)
              expect(yield* Fiber.join(cancel)).toMatchObject({
                _tag: "Success",
                success: { status: "cancelled" }
              })
              yield* Deferred.succeed(allowPublish, undefined)
              expect(yield* Fiber.join(publish)).toBe(false)
            } else {
              yield* Deferred.succeed(allowPublish, undefined)
              expect(yield* Fiber.join(publish)).toBe(true)
              yield* Deferred.succeed(allowCancel, undefined)
              expect(yield* Fiber.join(cancel)).toMatchObject({
                _tag: "Failure",
                failure: { _tag: "Conflict" }
              })
            }
            expect(yield* p.finalizeInterrupted(fenceFor(running)!)).toBe(false)
            const current = yield* p.owned(owner, created.id)
            expect(current).toMatchObject({
              status: winner === "cancel" ? "cancelled" : "succeeded",
              workflowExecutionId: running.workflowExecutionId,
              workflowAttempt: running.workflowAttempt
            })
            if (winner === "cancel")
              expect(current.retainedUntil).not.toBeNull()
            else expect(current.retainedUntil).toBeNull()
          }).pipe(
            Effect.provide(Layer.merge(commands, scanningWorkflow(p, owner)))
          )
        }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
      )
    },
    20000
  )

  it("rolls back acceptance and a submitted SQL deferred without releasing or poisoning the gate", async () => {
    const owner = await fixture()
    await Effect.runPromise(
      Effect.gen(function* () {
        const p = yield* JiraMigrationProjection
        const sql = yield* SqlClient.SqlClient
        const scanned = yield* Deferred.make<string>()
        const released = yield* Deferred.make<void>()
        const workflow = JiraMigrationWorkflow.toLayer((payload, executionId) =>
          Effect.gen(function* () {
            if (payload.command._tag !== "Create")
              return yield* Effect.die("unexpected rescan")
            const row = yield* p
              .ensureCreated({ ...payload.command, executionId })
              .pipe(Effect.orDie)
            yield* p.completeScan(fenceFor(row)!, scan).pipe(Effect.orDie)
            yield* Deferred.succeed(scanned, row.id)
            yield* DurableDeferred.await(startImportDeferred(1))
            yield* Deferred.succeed(released, undefined)
            return { migrationId: row.id }
          })
        )
        yield* Effect.gen(function* () {
          yield* JiraMigrationWorkflow.execute(
            {
              command: {
                _tag: "Create",
                ...owner,
                requestId: randomUUID(),
                source
              }
            },
            { discard: true }
          )
          const id = yield* Deferred.await(scanned)
          const row = yield* p.owned(owner, id)
          const ready = yield* p.saveConfiguration({
            owner,
            migrationId: id,
            expectedRevision: row.revision,
            configuration
          })
          const input = {
            owner,
            migrationId: id,
            expectedRevision: ready.revision
          }
          const submitted = yield* Deferred.make<void>()
          const rollback = yield* Deferred.make<void>()
          const transaction = yield* sql
            .withTransaction(
              Effect.gen(function* () {
                yield* submitJiraMigrationRun(input)
                yield* Deferred.succeed(submitted, undefined)
                yield* Deferred.await(rollback)
                return yield* new Conflict({ reason: "force_rollback" })
              })
            )
            .pipe(Effect.result, Effect.forkChild)
          yield* Deferred.await(submitted)
          const outside = yield* Effect.promise(() =>
            pool.query(
              "select status, revision, checkpoint from jira_migration where id = $1",
              [id]
            )
          )
          expect(outside.rows[0]).toMatchObject({
            status: "ready",
            revision: ready.revision
          })
          yield* Effect.sleep("100 millis")
          expect(yield* Deferred.isDone(released)).toBe(false)
          yield* Deferred.succeed(rollback, undefined)
          expect(yield* Fiber.join(transaction)).toMatchObject({
            _tag: "Failure"
          })
          expect(yield* p.owned(owner, id)).toMatchObject({
            status: "ready",
            revision: ready.revision
          })
          yield* submitJiraMigrationRun(input)
          yield* Deferred.await(released).pipe(Effect.timeout("5 seconds"))
          expect((yield* p.owned(owner, id)).status).toBe("migrating")
          expect(
            yield* Effect.result(submitJiraMigrationRun(input))
          ).toMatchObject({ _tag: "Failure", failure: { _tag: "Conflict" } })
        }).pipe(Effect.provide(workflow))
      }).pipe(Effect.provide(commandTestLayer()), Effect.scoped)
    )
  }, 20000)
})
