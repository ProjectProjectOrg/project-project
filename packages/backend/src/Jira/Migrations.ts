import {
  Conflict,
  JiraError,
  JiraMigrationConfiguration,
  JiraMigrationDetail,
  NotFound,
  Validation,
  type JiraMigrationSummary
} from "@projectproject/shared"
import { and, desc, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schedule from "effect/Schedule"
import * as WorkflowEngine from "effect/unstable/workflow/WorkflowEngine"
import {
  JiraMigrationWorkflow,
  retryDeferred,
  startImportDeferred
} from "./MigrationWorkflow"
import * as DurableDeferred from "effect/unstable/workflow/DurableDeferred"
import * as Option from "effect/Option"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import {
  attachmentIndex,
  jiraMigration,
  organization,
  projectIndex
} from "../db/schema"
import { Db } from "../Services/Db"
import { OrgStorage } from "../Services/OrgStorage"
import { ProjectDocs } from "../Services/ProjectDocs"
import { S3Storage } from "../Services/S3Storage"

import {
  actionsFor,
  decodeConfiguration,
  isCompleteJiraConfiguration,
  decodeCheckpoint,
  toDetail,
  toSummary,
  type JiraMigrationRow,
  JiraMigrationProjection,
  matchesSource,
  fenceFor,
  type AttemptFence,
  type ProjectionOwner,
  type JiraMigrationCleanupMode
} from "./MigrationProjection"
export {
  actionsFor,
  isCompleteJiraConfiguration,
  type JiraMigrationCheckpoint
} from "./MigrationProjection"

export type JiraMigrationSource = Readonly<{
  cloudId: string
  siteName: string
  siteUrl: string
  projectId: string
  projectKey: string
  projectName: string
}>

export type JiraMigrationMutationError =
  | NotFound
  | Validation
  | Conflict
  | JiraError

export type JiraMigrationsShape = Readonly<{
  list: (
    organizationId: string,
    userId: string
  ) => Effect.Effect<ReadonlyArray<JiraMigrationSummary>, JiraError>
  create: (
    organizationId: string,
    userId: string,
    requestId: string,
    source: JiraMigrationSource
  ) => Effect.Effect<JiraMigrationDetail, Conflict | JiraError>
  get: (
    organizationId: string,
    userId: string,
    migrationId: string
  ) => Effect.Effect<JiraMigrationDetail, NotFound | JiraError>
  configure: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number,
    configuration: JiraMigrationConfiguration
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  rescan: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  run: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  cancel: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  discard: (
    organizationId: string,
    userId: string,
    migrationId: string
  ) => Effect.Effect<void, NotFound | Validation>
}>

export class JiraMigrations extends Context.Service<
  JiraMigrations,
  JiraMigrationsShape
>()("@projectproject/backend/Jira/Migrations/JiraMigrations") {}

export const JiraMigrationsLive = Layer.effect(
  JiraMigrations,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    const orgStorage = yield* OrgStorage
    const s3 = yield* S3Storage
    const projectDocs = yield* ProjectDocs

    const discardStagedArtifacts = Effect.fn(
      "JiraMigrations.discardStagedArtifacts"
    )(function* (row: JiraMigrationRow, orgSlug: string) {
      const connection = yield* orgStorage.requireConnection(orgSlug)
      const objectKey = (path: string) => {
        const prefix = (connection.keyPrefix ?? "").replace(/^\/+|\/+$/g, "")
        return prefix === "" ? path : `${prefix}/${path}`
      }
      yield* Effect.forEach(
        ["manifest.json", "archive.json", "report.md"].map(
          (name) => `${row.stagingPrefix}/${name}`
        ),
        (path) => s3.deleteObject(connection, objectKey(path)),
        { discard: true }
      )

      const configuration = yield* decodeConfiguration(row.configuration).pipe(
        Effect.orElseSucceed(() => null)
      )
      const stagedSlug =
        row.destinationProjectSlug ?? configuration?.destination.slug ?? null
      if (stagedSlug === null) return

      const stagedProject =
        row.destinationProjectId === null
          ? yield* db
              .select({
                id: projectIndex.id,
                publishedAt: projectIndex.publishedAt
              })
              .from(projectIndex)
              .where(eq(projectIndex.slug, stagedSlug))
              .limit(1)
              .pipe(Effect.orDie)
          : yield* db
              .select({
                id: projectIndex.id,
                publishedAt: projectIndex.publishedAt
              })
              .from(projectIndex)
              .where(eq(projectIndex.id, row.destinationProjectId))
              .limit(1)
              .pipe(Effect.orDie)
      if (stagedProject[0] && stagedProject[0].publishedAt !== null) return

      const staged = yield* db
        .select({
          id: attachmentIndex.id,
          objectKey: attachmentIndex.objectKey
        })
        .from(attachmentIndex)
        .where(
          and(
            eq(attachmentIndex.organizationId, row.organizationId),
            eq(attachmentIndex.projectSlug, stagedSlug)
          )
        )
        .pipe(Effect.orDie)
      yield* Effect.forEach(
        staged,
        (attachment) => s3.deleteObject(connection, attachment.objectKey),
        { concurrency: 4, discard: true }
      )
      if (staged.length > 0) {
        yield* db
          .delete(attachmentIndex)
          .where(
            and(
              eq(attachmentIndex.organizationId, row.organizationId),
              eq(attachmentIndex.projectSlug, stagedSlug)
            )
          )
          .pipe(Effect.orDie)
      }
      if (row.reportPath !== null) {
        yield* s3.deleteObject(connection, objectKey(row.reportPath))
        yield* s3.deleteObject(
          connection,
          objectKey(row.reportPath.replace(/report\.md$/, "archive.json"))
        )
      }
      yield* projectDocs.removeDir(orgSlug, stagedSlug)
    })

    const ownedRow = (
      organizationId: string,
      userId: string,
      migrationId: string
    ) =>
      db
        .select()
        .from(jiraMigration)
        .where(
          and(
            eq(jiraMigration.id, migrationId),
            eq(jiraMigration.organizationId, organizationId),
            eq(jiraMigration.initiatedBy, userId)
          )
        )
        .limit(1)
        .pipe(
          Effect.orDie,
          Effect.flatMap((rows) =>
            rows[0] ? Effect.succeed(rows[0]) : Effect.fail(new NotFound())
          )
        )

    const get = (organizationId: string, userId: string, migrationId: string) =>
      ownedRow(organizationId, userId, migrationId).pipe(
        Effect.flatMap(toDetail)
      )

    const updateRevision = (
      row: JiraMigrationRow,
      expectedRevision: number,
      values: Partial<typeof jiraMigration.$inferInsert>
    ) =>
      Effect.gen(function* () {
        if (row.revision !== expectedRevision) {
          return yield* new Conflict({
            reason: "jira_migration_revision_conflict"
          })
        }
        const now = yield* DateTime.nowAsDate
        const updated = yield* db
          .update(jiraMigration)
          .set({ ...values, revision: expectedRevision + 1, updatedAt: now })
          .where(
            and(
              eq(jiraMigration.id, row.id),
              eq(jiraMigration.revision, expectedRevision)
            )
          )
          .returning()
          .pipe(Effect.orDie)
        if (!updated[0]) {
          return yield* new Conflict({
            reason: "jira_migration_revision_conflict"
          })
        }
        return yield* toDetail(updated[0])
      })

    return JiraMigrations.of({
      list: (organizationId, userId) =>
        db
          .select()
          .from(jiraMigration)
          .where(
            and(
              eq(jiraMigration.organizationId, organizationId),
              eq(jiraMigration.initiatedBy, userId)
            )
          )
          .orderBy(desc(jiraMigration.createdAt))
          .pipe(
            Effect.orDie,
            Effect.map((rows) => rows.map(toSummary))
          ),
      create: (organizationId, userId, requestId, source) =>
        sql
          .withTransaction(
            Effect.gen(function* () {
              const existing = yield* db
                .select()
                .from(jiraMigration)
                .where(
                  and(
                    eq(jiraMigration.organizationId, organizationId),
                    eq(jiraMigration.initiatedBy, userId),
                    eq(jiraMigration.requestId, requestId)
                  )
                )
                .limit(1)
                .pipe(Effect.orDie)
              if (existing[0]) {
                if (
                  existing[0].sourceCloudId !== source.cloudId ||
                  existing[0].sourceProjectId !== source.projectId
                ) {
                  return yield* new Conflict({
                    reason: "jira_migration_request_conflict"
                  })
                }
                return yield* toDetail(existing[0])
              }
              const [{ id }] = yield* sql<Readonly<{ id: string }>>`
              SELECT gen_random_uuid()::text AS id
            `
              const inserted = yield* db
                .insert(jiraMigration)
                .values({
                  id,
                  requestId,
                  organizationId,
                  initiatedBy: userId,
                  sourceCloudId: source.cloudId,
                  sourceSiteName: source.siteName,
                  sourceSiteUrl: source.siteUrl,
                  sourceProjectId: source.projectId,
                  sourceProjectKey: source.projectKey,
                  sourceProjectName: source.projectName,
                  stagingPrefix: `migrations/jira/${id}`
                })
                .onConflictDoNothing({
                  target: [
                    jiraMigration.initiatedBy,
                    jiraMigration.organizationId,
                    jiraMigration.requestId
                  ]
                })
                .returning()
                .pipe(Effect.orDie)
              if (inserted[0]) return yield* toDetail(inserted[0])
              const replay = yield* db
                .select()
                .from(jiraMigration)
                .where(
                  and(
                    eq(jiraMigration.organizationId, organizationId),
                    eq(jiraMigration.initiatedBy, userId),
                    eq(jiraMigration.requestId, requestId)
                  )
                )
                .limit(1)
                .pipe(Effect.orDie)
              if (
                !replay[0] ||
                replay[0].sourceCloudId !== source.cloudId ||
                replay[0].sourceProjectId !== source.projectId
              ) {
                return yield* new Conflict({
                  reason: "jira_migration_request_conflict"
                })
              }
              return yield* toDetail(replay[0])
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die)),
      get,
      configure: (
        organizationId,
        userId,
        migrationId,
        expectedRevision,
        configuration
      ) =>
        Effect.gen(function* () {
          const row = yield* ownedRow(organizationId, userId, migrationId)
          if (
            row.status !== "needs_configuration" &&
            row.status !== "ready" &&
            !(row.status === "failed" && row.scanAt !== null)
          ) {
            return yield* new Validation({
              reason: "jira_migration_not_configurable"
            })
          }
          const checkpoint = yield* decodeCheckpoint(row.checkpoint)
          if (!checkpoint.scan) {
            return yield* new Validation({
              reason: "jira_migration_scan_incomplete"
            })
          }
          const complete = isCompleteJiraConfiguration(
            configuration,
            checkpoint.scan.requirements
          )
          return yield* updateRevision(row, expectedRevision, {
            configuration,
            status: complete ? "ready" : "needs_configuration",
            phase: complete ? "ready" : "configuration",
            failureReason: null,
            failureRetryable: null,
            finishedAt: null
          })
        }),
      rescan: (organizationId, userId, migrationId, expectedRevision) =>
        Effect.gen(function* () {
          const row = yield* ownedRow(organizationId, userId, migrationId)
          if (
            ![
              "needs_configuration",
              "ready",
              "failed",
              "reconnect_required",
              "cancelled"
            ].includes(row.status)
          ) {
            return yield* new Validation({
              reason: "jira_migration_rescan_not_allowed"
            })
          }
          return yield* updateRevision(row, expectedRevision, {
            status: "scanning",
            phase: "queued_scan",
            configuration: null,
            checkpoint: null,
            progressDone: 0,
            progressTotal: null,
            scanAt: null,
            failureReason: null,
            failureRetryable: null,
            finishedAt: null,
            leaseId: null,
            leaseExpiresAt: null
          })
        }),
      run: (organizationId, userId, migrationId, expectedRevision) =>
        Effect.gen(function* () {
          const row = yield* ownedRow(organizationId, userId, migrationId)
          const retryableFailure =
            row.status === "failed" && row.failureRetryable === true
          if (row.status !== "ready" && !retryableFailure) {
            return yield* new Validation({
              reason:
                row.status === "reconnect_required"
                  ? "jira_migration_reconnect_required"
                  : "jira_migration_run_not_allowed"
            })
          }
          const scanRetry = retryableFailure && row.scanAt === null
          return yield* updateRevision(row, expectedRevision, {
            status: scanRetry ? "scanning" : "migrating",
            phase: scanRetry ? "queued_scan" : row.phase,
            failureReason: null,
            failureRetryable: null,
            finishedAt: null,
            leaseId: null,
            leaseExpiresAt: null
          })
        }),
      cancel: (organizationId, userId, migrationId, expectedRevision) =>
        Effect.gen(function* () {
          const row = yield* ownedRow(organizationId, userId, migrationId)
          if (row.status === "succeeded" || row.status === "cancelled") {
            return yield* new Validation({
              reason: "jira_migration_cancel_not_allowed"
            })
          }
          const active =
            row.status === "scanning" ||
            row.status === "migrating" ||
            row.status === "cancelling"
          const now = yield* DateTime.nowAsDate
          return yield* updateRevision(row, expectedRevision, {
            status: active ? "cancelling" : "cancelled",
            phase: active ? "cancelling" : "cancelled",
            finishedAt: active ? null : now,
            leaseId: active ? row.leaseId : null,
            leaseExpiresAt: active ? row.leaseExpiresAt : null
          })
        }),
      discard: (organizationId, userId, migrationId) =>
        Effect.gen(function* () {
          const row = yield* ownedRow(organizationId, userId, migrationId)
          if (row.status !== "failed" && row.status !== "cancelled") {
            return yield* new Validation({
              reason: "jira_migration_discard_not_allowed"
            })
          }
          const org = yield* db
            .select({ slug: organization.slug })
            .from(organization)
            .where(eq(organization.id, row.organizationId))
            .limit(1)
            .pipe(Effect.orDie)
          if (org[0]) {
            yield* discardStagedArtifacts(row, org[0].slug).pipe(
              Effect.catchCause((cause) =>
                Effect.logWarning(
                  "Jira migration discard left staging artifacts behind",
                  cause
                )
              )
            )
          }
          yield* db
            .delete(jiraMigration)
            .where(eq(jiraMigration.id, row.id))
            .pipe(Effect.orDie)
        })
    })
  })
)

export const JiraMigrationsWorkflowLive = (
  commands: Pick<JiraMigrationsShape, "run" | "cancel" | "discard">,
  prepareRescan?: (
    row: JiraMigrationRow
  ) => Effect.Effect<JiraMigrationRow, JiraMigrationMutationError>,
  configure?: JiraMigrationsShape["configure"]
) =>
  Layer.effect(
    JiraMigrations,
    Effect.gen(function* () {
      const projection = yield* JiraMigrationProjection
      const engine = yield* WorkflowEngine.WorkflowEngine
      const create = Effect.fn("JiraMigrations.create")(
        function* (
          organizationId: string,
          userId: string,
          requestId: string,
          source: JiraMigrationSource
        ) {
          const executionId = yield* JiraMigrationWorkflow.execute(
            {
              command: {
                _tag: "Create",
                organizationId,
                userId,
                requestId,
                source
              }
            },
            { discard: true }
          )
          const row = yield* projection
            .owned({ organizationId, userId }, executionId)
            .pipe(
              Effect.retry({
                while: (error) => error._tag === "NotFound",
                schedule: Schedule.spaced("20 millis")
              }),
              Effect.timeout("1 second"),
              Effect.mapError((error) =>
                error._tag === "JiraError"
                  ? error
                  : new JiraError({ reason: "timeout" })
              )
            )
          if (!matchesSource(row, source))
            return yield* new Conflict({
              reason: "jira_migration_request_conflict"
            })
          return yield* projection.toDetail(row)
        },
        Effect.provideService(WorkflowEngine.WorkflowEngine, engine)
      )
      const rescan = Effect.fn("JiraMigrations.rescan")(
        function* (
          organizationId: string,
          userId: string,
          migrationId: string,
          expectedRevision: number
        ) {
          const owner = { organizationId, userId }
          let row = yield* projection.owned(owner, migrationId)
          if (row.revision !== expectedRevision || !fenceFor(row))
            return yield* new Conflict({
              reason: "jira_migration_revision_conflict"
            })
          if (!actionsFor(row).canRescan)
            return yield* new Validation({
              reason: "jira_migration_rescan_not_allowed"
            })
          if (row.destinationProjectId !== null) {
            if (!prepareRescan)
              return yield* new Validation({
                reason: "jira_migration_rescan_not_allowed"
              })
            row = yield* prepareRescan(row)
          }
          const command = {
            _tag: "Rescan" as const,
            supersededExecutionId: row.workflowExecutionId!,
            migrationId,
            expectedRevision: row.revision,
            workflowAttempt: row.workflowAttempt + 1,
            scanRevision: row.scanRevision + 1
          }
          const executionId = yield* JiraMigrationWorkflow.execute(
            { command },
            { discard: true }
          )
          yield* projection.beginRescan({ ...command, executionId })
          yield* JiraMigrationWorkflow.interrupt(row.workflowExecutionId!)
          return yield* projection
            .owned(owner, migrationId)
            .pipe(Effect.flatMap(projection.toDetail))
        },
        Effect.provideService(WorkflowEngine.WorkflowEngine, engine)
      )
      return JiraMigrations.of({
        ...commands,
        create,
        rescan,
        list: (organizationId, userId) =>
          projection
            .listOwned({ organizationId, userId })
            .pipe(Effect.map((rows) => rows.map(toSummary))),
        get: (organizationId, userId, migrationId) =>
          projection
            .owned({ organizationId, userId }, migrationId)
            .pipe(Effect.flatMap(projection.toDetail)),
        configure:
          configure ??
          ((
            organizationId,
            userId,
            migrationId,
            expectedRevision,
            configuration
          ) =>
            projection.saveConfiguration({
              owner: { organizationId, userId },
              migrationId,
              expectedRevision,
              configuration
            }))
      })
    })
  )

export type JiraMigrationCleanupCommand = AttemptFence &
  Readonly<{
    expectedRevision: number
    mode: JiraMigrationCleanupMode
  }>
export type JiraMigrationCleanupCommands = Readonly<{
  start: (
    input: JiraMigrationCleanupCommand
  ) => Effect.Effect<string, JiraMigrationMutationError>
  awaitReset: (
    input: JiraMigrationCleanupCommand &
      Readonly<{ cleanupExecutionId: string }>
  ) => Effect.Effect<
    Readonly<{ fence: AttemptFence; revision: number }>,
    JiraMigrationMutationError
  >
}>
export type JiraMigrationMaterializationCommands = Readonly<{
  unresolvedFailedAttachments: (
    input: AttemptFence & Readonly<{ expectedRevision: number }>
  ) => Effect.Effect<ReadonlyArray<string>, JiraMigrationMutationError>
}>
export type JiraMigrationRunCommand = Readonly<{
  owner: ProjectionOwner
  migrationId: string
  expectedRevision: number
}>
export const submitJiraMigrationRun = Effect.fn("submitJiraMigrationRun")(
  function* (input: JiraMigrationRunCommand) {
    const projection = yield* JiraMigrationProjection
    const sql = yield* SqlClient.SqlClient
    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const row = yield* projection.owned(input.owner, input.migrationId)
          if (row.revision !== input.expectedRevision || !fenceFor(row))
            return yield* new Conflict({
              reason: "jira_migration_revision_conflict"
            })
          const checkpoint = yield* decodeCheckpoint(row.checkpoint)
          const gate = checkpoint.currentGate
          if (
            !gate ||
            (gate._tag === "StartImport"
              ? gate.scanRevision !== row.scanRevision
              : gate.failureSequence !== row.failureSequence)
          )
            return yield* new Validation({
              reason: "jira_migration_run_not_allowed"
            })
          const accepted = yield* projection.transition({
            ...input,
            action: "run"
          })
          if (gate._tag === "StartImport") {
            const deferred = startImportDeferred(gate.scanRevision)
            const token = DurableDeferred.tokenFromExecutionId(deferred, {
              workflow: JiraMigrationWorkflow,
              executionId: row.workflowExecutionId!
            })
            yield* DurableDeferred.succeed(deferred, {
              token,
              value: { scanRevision: gate.scanRevision }
            })
          } else {
            const deferred = retryDeferred(gate.failureSequence)
            const token = DurableDeferred.tokenFromExecutionId(deferred, {
              workflow: JiraMigrationWorkflow,
              executionId: row.workflowExecutionId!
            })
            yield* DurableDeferred.succeed(deferred, {
              token,
              value: { failureSequence: gate.failureSequence }
            })
          }
          return accepted
        })
      )
      .pipe(
        Effect.catchTag("SqlError", () =>
          Effect.fail(new JiraError({ reason: "server_error" }))
        )
      )
  }
)

export const JiraMigrationsDurableLive = (
  cleanup: JiraMigrationCleanupCommands,
  materialization: JiraMigrationMaterializationCommands
) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const projection = yield* JiraMigrationProjection
      const sql = yield* SqlClient.SqlClient
      const engine = yield* WorkflowEngine.WorkflowEngine
      const provide = <A, E>(
        effect: Effect.Effect<
          A,
          E,
          | JiraMigrationProjection
          | SqlClient.SqlClient
          | WorkflowEngine.WorkflowEngine
        >
      ) =>
        effect.pipe(
          Effect.provideService(JiraMigrationProjection, projection),
          Effect.provideService(SqlClient.SqlClient, sql),
          Effect.provideService(WorkflowEngine.WorkflowEngine, engine)
        )
      const run: JiraMigrationsShape["run"] = Effect.fn("JiraMigrations.run")(
        function* (organizationId, userId, migrationId, expectedRevision) {
          const owner = { organizationId, userId }
          const accepted = yield* provide(
            submitJiraMigrationRun({ owner, migrationId, expectedRevision })
          )
          const observed = yield* projection.owned(owner, migrationId).pipe(
            Effect.repeat({
              while: (row) => row.revision <= accepted.revision,
              schedule: Schedule.spaced("20 millis")
            }),
            Effect.timeoutOption("2 seconds")
          )
          const current = Option.isSome(observed)
            ? observed.value
            : yield* projection.owned(owner, migrationId)
          return yield* projection.toDetail(current)
        }
      )
      const cancel: JiraMigrationsShape["cancel"] = Effect.fn(
        "JiraMigrations.cancel"
      )(function* (organizationId, userId, migrationId, expectedRevision) {
        const owner = { organizationId, userId }
        const row = yield* projection.owned(owner, migrationId)
        const fence = fenceFor(row)
        if (!fence)
          return yield* new Conflict({
            reason: "jira_migration_revision_conflict"
          })
        yield* projection.transition({
          owner,
          migrationId,
          expectedRevision,
          action: "cancel"
        })
        yield* provide(
          JiraMigrationWorkflow.interrupt(fence.workflowExecutionId)
        )
        yield* projection.finalizeInterrupted(fence)
        return yield* projection
          .owned(owner, migrationId)
          .pipe(Effect.flatMap(projection.toDetail))
      })
      const discard: JiraMigrationsShape["discard"] = Effect.fn(
        "JiraMigrations.discard"
      )(
        function* (organizationId, userId, migrationId) {
          const row = yield* projection.owned(
            { organizationId, userId },
            migrationId
          )
          const fence = fenceFor(row)
          if (!fence || !projection.actionsFor(row).canDiscard)
            return yield* new Validation({
              reason: "jira_migration_discard_not_allowed"
            })
          yield* cleanup.start({
            ...fence,
            expectedRevision: row.revision,
            mode: "discard"
          })
        },
        Effect.catchTag("Conflict", () =>
          Effect.fail(
            new Validation({ reason: "jira_migration_discard_not_allowed" })
          )
        ),
        Effect.catchTag("JiraError", (error) =>
          Effect.logError("Jira migration cleanup submission failed", {
            reason: error.reason
          }).pipe(
            Effect.andThen(
              Effect.fail(
                new Validation({ reason: "jira_migration_cleanup_failed" })
              )
            )
          )
        )
      )
      const prepareRescan = Effect.fn("JiraMigrations.prepareRescan")(
        function* (row: JiraMigrationRow) {
          const fence = fenceFor(row)
          if (!fence)
            return yield* new Conflict({
              reason: "jira_migration_revision_conflict"
            })
          const command = {
            ...fence,
            expectedRevision: row.revision,
            mode: "reset_import" as const
          }
          const cleanupExecutionId = yield* cleanup.start(command)
          const reset = yield* cleanup.awaitReset({
            ...command,
            cleanupExecutionId
          })
          const current = yield* projection.owned(
            { organizationId: row.organizationId, userId: row.initiatedBy },
            row.id
          )
          if (
            current.revision !== reset.revision ||
            current.workflowExecutionId !== reset.fence.workflowExecutionId ||
            current.workflowAttempt !== reset.fence.workflowAttempt ||
            current.id !== reset.fence.migrationId ||
            current.destinationProjectId !== null ||
            current.cleanupExecutionId !== null
          )
            return yield* new Conflict({
              reason: "jira_migration_revision_conflict"
            })
          return current
        }
      )
      const configure: JiraMigrationsShape["configure"] = Effect.fn(
        "JiraMigrations.configure"
      )(
        function* (
          organizationId,
          userId,
          migrationId,
          expectedRevision,
          configuration
        ) {
          const owner = { organizationId, userId }
          const row = yield* projection.owned(owner, migrationId)
          const fence = fenceFor(row)
          if (!fence || row.revision !== expectedRevision)
            return yield* new Conflict({
              reason: "jira_migration_revision_conflict"
            })
          const unresolvedFailedAttachmentIds =
            row.destinationProjectId === null
              ? undefined
              : yield* materialization.unresolvedFailedAttachments({
                  ...fence,
                  expectedRevision
                })
          return yield* projection.saveConfiguration({
            owner,
            migrationId,
            expectedRevision,
            configuration,
            unresolvedFailedAttachmentIds
          })
        }
      )
      return JiraMigrationsWorkflowLive(
        { run, cancel, discard },
        prepareRescan,
        configure
      )
    })
  )
