import {
  Conflict,
  JiraError,
  JiraMigrationConfiguration,
  JiraMigrationDetail,
  JiraMigrationRequirements,
  JiraMigrationScanSummary,
  NotFound,
  Validation,
  type JiraMigrationActions,
  type JiraMigrationSummary
} from "@projectproject/shared"
import { and, desc, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/unstable/sql/SqlClient"
import { jiraMigration } from "../db/schema"
import { Db } from "../Services/Db"

const JiraMigrationCheckpoint = Schema.Struct({
  scan: Schema.optional(
    Schema.Struct({
      summary: JiraMigrationScanSummary,
      requirements: JiraMigrationRequirements
    })
  )
})
export type JiraMigrationCheckpoint = typeof JiraMigrationCheckpoint.Type

type JiraMigrationRow = typeof jiraMigration.$inferSelect

export interface JiraMigrationSource {
  readonly cloudId: string
  readonly siteName: string
  readonly siteUrl: string
  readonly projectId: string
  readonly projectKey: string
  readonly projectName: string
}

export type JiraMigrationMutationError =
  | NotFound
  | Validation
  | Conflict
  | JiraError

export interface JiraMigrationsShape {
  readonly list: (
    organizationId: string,
    userId: string
  ) => Effect.Effect<ReadonlyArray<JiraMigrationSummary>, JiraError>
  readonly create: (
    organizationId: string,
    userId: string,
    requestId: string,
    source: JiraMigrationSource
  ) => Effect.Effect<JiraMigrationDetail, Conflict | JiraError>
  readonly get: (
    organizationId: string,
    userId: string,
    migrationId: string
  ) => Effect.Effect<JiraMigrationDetail, NotFound | JiraError>
  readonly configure: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number,
    configuration: JiraMigrationConfiguration
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  readonly rescan: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  readonly run: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  readonly cancel: (
    organizationId: string,
    userId: string,
    migrationId: string,
    expectedRevision: number
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  readonly discard: (
    organizationId: string,
    userId: string,
    migrationId: string
  ) => Effect.Effect<void, NotFound | Validation>
}

export class JiraMigrations extends Context.Service<
  JiraMigrations,
  JiraMigrationsShape
>()("@projectproject/backend/Jira/Migrations/JiraMigrations") {}

const dateTime = (value: Date) => DateTime.fromDateUnsafe(value)

const actionsFor = (row: JiraMigrationRow): JiraMigrationActions => ({
  canConfigure: row.status === "needs_configuration" || row.status === "ready",
  canRun:
    row.status === "ready" ||
    (row.status === "failed" && row.failureRetryable === true),
  canRescan: [
    "needs_configuration",
    "ready",
    "failed",
    "reconnect_required",
    "cancelled"
  ].includes(row.status),
  canCancel: row.status !== "cancelled" && row.status !== "succeeded",
  canRetry:
    (row.status === "failed" && row.failureRetryable === true) ||
    row.status === "reconnect_required",
  canDiscard: row.status === "failed" || row.status === "cancelled"
})

const toSummary = (row: JiraMigrationRow): JiraMigrationSummary => ({
  id: row.id,
  sourceCloudId: row.sourceCloudId,
  sourceProjectId: row.sourceProjectId,
  sourceProjectKey: row.sourceProjectKey,
  sourceProjectName: row.sourceProjectName,
  status: row.status,
  phase: row.phase,
  revision: row.revision,
  progress: {
    phase: row.phase,
    done: row.progressDone,
    total: row.progressTotal
  },
  destinationProjectSlug: row.destinationProjectSlug,
  createdAt: dateTime(row.createdAt),
  updatedAt: dateTime(row.updatedAt)
})

const decodeCheckpoint = (value: unknown) =>
  value == null
    ? Effect.succeed<JiraMigrationCheckpoint>({})
    : Schema.decodeUnknownEffect(JiraMigrationCheckpoint)(value).pipe(
        Effect.mapError(() => new JiraError({ reason: "invalid_response" }))
      )

const decodeConfiguration = (value: unknown) =>
  value == null
    ? Effect.succeed<JiraMigrationConfiguration | null>(null)
    : Schema.decodeUnknownEffect(JiraMigrationConfiguration)(value).pipe(
        Effect.mapError(() => new JiraError({ reason: "invalid_response" }))
      )

const toDetail = (row: JiraMigrationRow) =>
  Effect.gen(function* () {
    const checkpoint = yield* decodeCheckpoint(row.checkpoint)
    const configuration = yield* decodeConfiguration(row.configuration)
    return {
      ...toSummary(row),
      scanSummary: checkpoint.scan?.summary ?? null,
      requirements: checkpoint.scan?.requirements ?? null,
      configuration,
      actions: actionsFor(row),
      failure:
        row.failureReason === null
          ? null
          : {
              reason: row.failureReason,
              retryable: row.failureRetryable === true
            },
      reportPath: row.reportPath,
      finishedAt: row.finishedAt === null ? null : dateTime(row.finishedAt)
    } satisfies JiraMigrationDetail
  })

const exactlyOne = <A>(
  values: ReadonlyArray<A>,
  key: (value: A) => string,
  required: ReadonlyArray<string>
) => {
  const counts = new Map<string, number>()
  for (const value of values) {
    const itemKey = key(value)
    counts.set(itemKey, (counts.get(itemKey) ?? 0) + 1)
  }
  return (
    counts.size === required.length &&
    required.every((itemKey) => counts.get(itemKey) === 1)
  )
}

export const isCompleteJiraConfiguration = (
  configuration: JiraMigrationConfiguration,
  requirements: JiraMigrationRequirements
): boolean => {
  const identitiesValid =
    exactlyOne(
      configuration.identities,
      ({ jiraAccountId }) => jiraAccountId,
      requirements.identities.map(({ jiraAccountId }) => jiraAccountId)
    ) &&
    configuration.identities.every(
      ({ projectProjectUserId }) =>
        projectProjectUserId === null ||
        requirements.identityOptions.some(
          ({ id }) => id === projectProjectUserId
        )
    )
  const statusesValid =
    exactlyOne(
      configuration.statuses,
      ({ jiraStatusId }) => jiraStatusId,
      requirements.statuses.map(({ jiraStatusId }) => jiraStatusId)
    ) &&
    configuration.statuses.every(({ projectStatusSlug }) =>
      requirements.statusOptions.some(({ slug }) => slug === projectStatusSlug)
    )
  const issueTypesValid = exactlyOne(
    configuration.issueTypes,
    ({ jiraIssueTypeId }) => jiraIssueTypeId,
    requirements.issueTypes.map(({ jiraIssueTypeId }) => jiraIssueTypeId)
  )
  const prioritiesValid = exactlyOne(
    configuration.priorities,
    ({ jiraPriorityId }) => jiraPriorityId,
    requirements.priorities.map(({ jiraPriorityId }) => jiraPriorityId)
  )
  const tagsValid = exactlyOne(
    configuration.tags,
    ({ source }) => `${source.kind}:${source.value}`,
    requirements.tags.map(({ source }) => `${source.kind}:${source.value}`)
  )
  const sprintChoicesValid =
    exactlyOne(
      configuration.activeFutureSprintChoices,
      ({ jiraIssueId }) => jiraIssueId,
      requirements.activeFutureSprintChoices.map(
        ({ jiraIssueId }) => jiraIssueId
      )
    ) &&
    configuration.activeFutureSprintChoices.every((choice) => {
      if (choice.jiraSprintId === null) return true
      const requirement = requirements.activeFutureSprintChoices.find(
        ({ jiraIssueId }) => jiraIssueId === choice.jiraIssueId
      )
      return requirement?.options.some(
        ({ jiraSprintId }) => jiraSprintId === choice.jiraSprintId
      )
    })
  const forcedSkips = requirements.attachments
    .filter(({ forcedSkipReason }) => forcedSkipReason !== null)
    .map(({ jiraAttachmentId }) => jiraAttachmentId)
  const knownAttachments = new Set(
    requirements.attachments.map(({ jiraAttachmentId }) => jiraAttachmentId)
  )
  const skipped = new Set(configuration.skippedAttachmentIds)
  const attachmentsValid =
    skipped.size === configuration.skippedAttachmentIds.length &&
    configuration.skippedAttachmentIds.every((id) =>
      knownAttachments.has(id)
    ) &&
    forcedSkips.every((id) => skipped.has(id)) &&
    (skipped.size === 0 || configuration.attachmentSkipsAccepted)
  return (
    identitiesValid &&
    statusesValid &&
    issueTypesValid &&
    prioritiesValid &&
    tagsValid &&
    sprintChoicesValid &&
    attachmentsValid
  )
}

export const JiraMigrationsLive = Layer.effect(
  JiraMigrations,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient

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
              const [{ id }] = yield* sql<{ readonly id: string }>`
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
          if (row.status !== "needs_configuration" && row.status !== "ready") {
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
            phase: complete ? "ready" : "configuration"
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
          yield* db
            .delete(jiraMigration)
            .where(eq(jiraMigration.id, row.id))
            .pipe(Effect.orDie)
        })
    })
  })
)
