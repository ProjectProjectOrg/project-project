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
import {
  and,
  desc,
  eq,
  inArray,
  isNull,
  isNotNull,
  ne,
  sql as sqlFragment
} from "drizzle-orm"
import { Context, DateTime, Effect, Layer, Predicate, Schema } from "effect"
import { jiraMigration } from "../db/schema"
import { Db } from "../Services/Db"
import { JiraArtifactRef } from "./MigrationArtifacts"
import { buildJiraStatusCreateOptions } from "./Mappings"
import type {
  JiraMigrationSource,
  JiraMigrationMutationError
} from "./Migrations"

const PersistedJiraMigrationScanSummary = Schema.Struct({
  ...JiraMigrationScanSummary.fields,
  scannedAt: Schema.DateTimeUtcFromString
})

export const JiraMigrationGate = Schema.Union([
  Schema.TaggedStruct("StartImport", {
    version: Schema.Literal(1),
    scanRevision: Schema.Int
  }),
  Schema.TaggedStruct("Retry", {
    version: Schema.Literal(1),
    failureSequence: Schema.Int,
    phase: Schema.Literals(["scan", "import"])
  })
])
export type JiraMigrationGate = typeof JiraMigrationGate.Type

export const JiraMigrationCheckpoint = Schema.Struct({
  publishedPlan: Schema.optional(
    Schema.Struct({
      planRef: JiraArtifactRef,
      publicationRevision: Schema.String
    })
  ),
  remoteWritesMayStillCommit: Schema.optional(
    Schema.Struct({
      workflowExecutionId: Schema.String,
      workflowAttempt: Schema.Int
    })
  ),
  currentGate: Schema.optional(JiraMigrationGate),
  acceptedConfiguration: Schema.optional(
    Schema.Struct({
      configurationRevision: Schema.Int,
      configuration: JiraMigrationConfiguration
    })
  ),
  scanFailureReceipts: Schema.optional(
    Schema.Record(Schema.String, Schema.Int)
  ),
  scanPages: Schema.optional(Schema.Record(Schema.String, Schema.Int)),
  scan: Schema.optional(
    Schema.Struct({
      manifest: Schema.optional(JiraArtifactRef),
      summary: PersistedJiraMigrationScanSummary,
      requirements: JiraMigrationRequirements
    })
  )
})
export type JiraMigrationCheckpoint = typeof JiraMigrationCheckpoint.Type

export type JiraMigrationRow = typeof jiraMigration.$inferSelect

const dateTime = (value: Date) => DateTime.fromDateUnsafe(value)

export const actionsFor = (row: JiraMigrationRow): JiraMigrationActions => ({
  canConfigure:
    row.cleanupExecutionId === null &&
    (row.status === "needs_configuration" ||
      row.status === "ready" ||
      (row.status === "failed" && row.scanAt !== null)),
  canRun:
    row.cleanupExecutionId === null &&
    (row.status === "ready" ||
      (row.status === "failed" && row.failureRetryable === true) ||
      row.status === "reconnect_required"),
  canRescan:
    row.cleanupExecutionId === null &&
    [
      "needs_configuration",
      "ready",
      "failed",
      "reconnect_required",
      "cancelled"
    ].includes(row.status),
  canCancel:
    row.cleanupExecutionId === null &&
    row.status !== "cancelled" &&
    row.status !== "succeeded",
  canRetry:
    row.cleanupExecutionId === null &&
    ((row.status === "failed" && row.failureRetryable === true) ||
      row.status === "reconnect_required"),
  canDiscard:
    row.cleanupExecutionId === null &&
    (row.status === "failed" || row.status === "cancelled")
})

export const toSummary = (row: JiraMigrationRow): JiraMigrationSummary => ({
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

export const decodeCheckpoint = (value: unknown) =>
  value == null
    ? Effect.succeed<JiraMigrationCheckpoint>({})
    : Schema.decodeUnknownEffect(JiraMigrationCheckpoint)(
        enrichPersistedCheckpoint(value)
      ).pipe(
        Effect.mapError(() => new JiraError({ reason: "invalid_response" }))
      )

export const decodeConfiguration = (value: unknown) =>
  value == null
    ? Effect.succeed<JiraMigrationConfiguration | null>(null)
    : Schema.decodeUnknownEffect(JiraMigrationConfiguration)(value).pipe(
        Effect.mapError(() => new JiraError({ reason: "invalid_response" }))
      )

export const toDetail = (row: JiraMigrationRow) =>
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
    configuration.statuses.every((mapping) => {
      if (mapping.createStatus === true) {
        return requirements.statuses.some(
          ({ jiraStatusId, createOption }) =>
            jiraStatusId === mapping.jiraStatusId &&
            createOption?.slug === mapping.projectStatusSlug
        )
      }
      return requirements.statusOptions.some(
        ({ slug }) => slug === mapping.projectStatusSlug
      )
    })
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
    configuration.restrictedContent !== null &&
    attachmentsValid
  )
}

export const isAllowedAttachmentCorrection = (
  accepted: JiraMigrationConfiguration,
  configuration: JiraMigrationConfiguration,
  unresolved: ReadonlyArray<string>
) => {
  const unchanged = Schema.toEquivalence(JiraMigrationConfiguration)(accepted, {
    ...configuration,
    skippedAttachmentIds: accepted.skippedAttachmentIds,
    attachmentSkipsAccepted: accepted.attachmentSkipsAccepted
  })
  return (
    unchanged &&
    configuration.attachmentSkipsAccepted &&
    accepted.skippedAttachmentIds.every((id) =>
      configuration.skippedAttachmentIds.includes(id)
    ) &&
    configuration.skippedAttachmentIds.every(
      (id) =>
        accepted.skippedAttachmentIds.includes(id) || unresolved.includes(id)
    )
  )
}

function enrichPersistedCheckpoint(value: unknown): unknown {
  if (!Predicate.isObject(value) || !Predicate.isObject(value.scan))
    return value
  const requirements = value.scan.requirements
  if (!Predicate.isObject(requirements)) return value
  const sourceStatuses = Array.isArray(requirements.statuses)
    ? requirements.statuses.filter(Predicate.isObject).flatMap((status) =>
        typeof status.jiraStatusId === "string" &&
        typeof status.name === "string" &&
        (typeof status.categoryKey === "string" || status.categoryKey === null)
          ? [
              {
                id: status.jiraStatusId,
                name: status.name,
                categoryKey: status.categoryKey
              }
            ]
          : []
      )
    : []
  const createOptions = new Map(
    buildJiraStatusCreateOptions(sourceStatuses).map((candidate) => [
      candidate.sourceStatusId,
      candidate.createOption
    ])
  )
  const statuses = Array.isArray(requirements.statuses)
    ? requirements.statuses.map((status) =>
        Predicate.isObject(status) && !("createOption" in status)
          ? {
              ...status,
              createOption:
                typeof status.jiraStatusId === "string"
                  ? (createOptions.get(status.jiraStatusId) ?? null)
                  : null
            }
          : status
      )
    : requirements.statuses
  const statusOptions = Array.isArray(requirements.statusOptions)
    ? requirements.statusOptions.map((option) => {
        if (
          !Predicate.isObject(option) ||
          ("icon" in option && "color" in option)
        ) {
          return option
        }
        const style = baselineStatusStyle(option.slug)
        return { ...option, ...style }
      })
    : requirements.statusOptions
  return {
    ...value,
    scan: {
      ...value.scan,
      requirements: { ...requirements, statuses, statusOptions }
    }
  }
}

function baselineStatusStyle(slug: unknown) {
  if (slug === "in_progress") {
    return { icon: "CircleDot", color: "#3b82f6" }
  }
  if (slug === "done") {
    return { icon: "CircleCheck", color: "#22c55e" }
  }
  return { icon: "CircleDashed", color: "#a3a3a3" }
}

export type AttemptFence = Readonly<{
  migrationId: string
  workflowExecutionId: string
  workflowAttempt: number
}>
export type ProjectionOwner = Readonly<{
  organizationId: string
  userId: string
}>
export type EnsureCreatedInput = ProjectionOwner &
  Readonly<{
    requestId: string
    source: JiraMigrationSource
    executionId: string
  }>
export type BeginRescanInput = Readonly<{
  supersededExecutionId: string
  migrationId: string
  expectedRevision: number
  workflowAttempt: number
  scanRevision: number
  executionId: string
}>
export type BeginRescanResult = Readonly<
  JiraMigrationRow & {
    supersededExecutionId: string
  }
>
export type SaveConfigurationInput = Readonly<{
  owner: ProjectionOwner
  migrationId: string
  expectedRevision: number
  configuration: JiraMigrationConfiguration
  unresolvedFailedAttachmentIds?: ReadonlyArray<string>
}>
export type ProjectionPatch = Partial<
  Pick<
    JiraMigrationRow,
    | "status"
    | "phase"
    | "progressDone"
    | "progressTotal"
    | "checkpoint"
    | "scanAt"
    | "manifestVersion"
    | "destinationProjectId"
    | "destinationProjectSlug"
    | "reportPath"
    | "finishedAt"
  >
>
export type TransitionInput = Readonly<{
  owner: ProjectionOwner
  migrationId: string
  expectedRevision: number
  action: "run" | "cancel"
}>
export const JiraScanResumeResult = Schema.Union([
  Schema.TaggedStruct("Resumed", {}),
  Schema.TaggedStruct("AwaitRetry", { failureSequence: Schema.Int }),
  Schema.TaggedStruct("Rejected", {})
])
export type JiraScanResumeResult = typeof JiraScanResumeResult.Type

export type JiraMigrationCleanupMode =
  | "reset_import"
  | "discard"
  | "expire"
  | "post_success"

export type JiraMigrationProjectionShape = Readonly<{
  beginRemoteWrites: (fence: AttemptFence) => Effect.Effect<boolean, JiraError>
  settleRemoteWrites: (fence: AttemptFence) => Effect.Effect<boolean, JiraError>
  finalizeInterrupted: (
    fence: AttemptFence
  ) => Effect.Effect<boolean, JiraError>
  recordScanFailure: (
    fence: AttemptFence,
    operationKey: string,
    failure: Readonly<{
      reason: string
      retryable: boolean
      reconnect: boolean
    }>
  ) => Effect.Effect<number | null, JiraError>
  resumeScan: (
    fence: AttemptFence,
    failureSequence: number
  ) => Effect.Effect<JiraScanResumeResult, JiraError>
  recordScanProgress: (
    fence: AttemptFence,
    pageKey: string,
    count: number
  ) => Effect.Effect<boolean, JiraError>
  completeScan: (
    fence: AttemptFence,
    scan: Readonly<{
      manifest: JiraArtifactRef
      summary: JiraMigrationScanSummary
      requirements: JiraMigrationRequirements
    }>
  ) => Effect.Effect<boolean, JiraError>

  ensureCreated: (
    input: EnsureCreatedInput
  ) => Effect.Effect<JiraMigrationRow, Conflict | JiraError>
  beginRescan: (
    input: BeginRescanInput
  ) => Effect.Effect<BeginRescanResult, Conflict | Validation | JiraError>
  advance: (
    fence: AttemptFence,
    patch: ProjectionPatch
  ) => Effect.Effect<boolean, JiraError>
  recordFailure: (
    fence: AttemptFence,
    failure: Readonly<{
      reason: string
      retryable: boolean
      status?: "failed" | "reconnect_required"
    }>
  ) => Effect.Effect<boolean, JiraError>
  saveConfiguration: (
    input: SaveConfigurationInput
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  claimCleanup: (
    fence: AttemptFence,
    input: Readonly<{
      expectedRevision: number
      executionId: string
      mode: JiraMigrationCleanupMode
    }>
  ) => Effect.Effect<boolean, JiraError>
  releaseCleanup: (
    fence: AttemptFence,
    executionId: string,
    mode: JiraMigrationCleanupMode
  ) => Effect.Effect<boolean, JiraError>
  deleteAfterCleanup: (
    fence: AttemptFence,
    executionId: string
  ) => Effect.Effect<boolean, JiraError>
  owned: (
    owner: ProjectionOwner,
    migrationId: string
  ) => Effect.Effect<JiraMigrationRow, NotFound | JiraError>
  listOwned: (
    owner: ProjectionOwner
  ) => Effect.Effect<ReadonlyArray<JiraMigrationRow>, JiraError>
  transition: (
    input: TransitionInput
  ) => Effect.Effect<JiraMigrationDetail, JiraMigrationMutationError>
  toDetail: typeof toDetail
  actionsFor: typeof actionsFor
}>
export const matchesSource = (
  row: JiraMigrationRow,
  source: JiraMigrationSource
) =>
  row.sourceCloudId === source.cloudId &&
  row.sourceProjectId === source.projectId &&
  row.sourceSiteName === source.siteName &&
  row.sourceSiteUrl === source.siteUrl &&
  row.sourceProjectKey === source.projectKey &&
  row.sourceProjectName === source.projectName

export const fenceFor = (row: JiraMigrationRow): AttemptFence | null =>
  row.workflowExecutionId === null
    ? null
    : {
        migrationId: row.id,
        workflowExecutionId: row.workflowExecutionId,
        workflowAttempt: row.workflowAttempt
      }
const fenceWhere = (fence: AttemptFence) =>
  and(
    eq(jiraMigration.id, fence.migrationId),
    eq(jiraMigration.workflowExecutionId, fence.workflowExecutionId),
    eq(jiraMigration.workflowAttempt, fence.workflowAttempt)
  )
const conflict = () =>
  new Conflict({ reason: "jira_migration_revision_conflict" })
const databaseError = () => new JiraError({ reason: "server_error" })
const cleanupStatuses = ["failed", "cancelled"] as const
const cleanupStatusesFor = (mode: JiraMigrationCleanupMode) =>
  mode === "reset_import"
    ? resetStatuses
    : mode === "post_success"
      ? (["succeeded"] as const)
      : cleanupStatuses
const resetStatuses = [
  "needs_configuration",
  "ready",
  "failed",
  "reconnect_required",
  "cancelled"
] as const

export class JiraMigrationProjection extends Context.Service<
  JiraMigrationProjection,
  JiraMigrationProjectionShape
>()(
  "@projectproject/backend/Jira/MigrationProjection/JiraMigrationProjection"
) {
  static readonly layer = Layer.effect(
    JiraMigrationProjection,
    Effect.gen(function* () {
      const db = yield* Db
      const beginRemoteWrites: JiraMigrationProjectionShape["beginRemoteWrites"] =
        (fence) =>
          db
            .transaction((tx) =>
              Effect.gen(function* () {
                const rows = yield* tx
                  .select()
                  .from(jiraMigration)
                  .where(fenceWhere(fence))
                  .for("update")
                const row = rows[0]
                if (
                  !row ||
                  row.cleanupExecutionId !== null ||
                  !["scanning", "migrating"].includes(row.status)
                )
                  return false
                const checkpoint = yield* decodeCheckpoint(row.checkpoint)
                if (checkpoint.remoteWritesMayStillCommit)
                  return (
                    checkpoint.remoteWritesMayStillCommit
                      .workflowExecutionId === fence.workflowExecutionId &&
                    checkpoint.remoteWritesMayStillCommit.workflowAttempt ===
                      fence.workflowAttempt
                  )
                const now = yield* DateTime.nowAsDate
                yield* tx
                  .update(jiraMigration)
                  .set({
                    checkpoint: yield* Schema.encodeEffect(
                      JiraMigrationCheckpoint
                    )({
                      ...checkpoint,
                      remoteWritesMayStillCommit: {
                        workflowExecutionId: fence.workflowExecutionId,
                        workflowAttempt: fence.workflowAttempt
                      }
                    }),
                    updatedAt: now
                  })
                  .where(fenceWhere(fence))
                return true
              })
            )
            .pipe(Effect.mapError(databaseError))
      const settleRemoteWrites: JiraMigrationProjectionShape["settleRemoteWrites"] =
        (fence) =>
          db
            .transaction((tx) =>
              Effect.gen(function* () {
                const rows = yield* tx
                  .select()
                  .from(jiraMigration)
                  .where(fenceWhere(fence))
                  .for("update")
                const row = rows[0]
                if (!row) return false
                const checkpoint = yield* decodeCheckpoint(row.checkpoint)
                const pending = checkpoint.remoteWritesMayStillCommit
                if (!pending) return true
                if (
                  pending.workflowExecutionId !== fence.workflowExecutionId ||
                  pending.workflowAttempt !== fence.workflowAttempt
                )
                  return false
                const { remoteWritesMayStillCommit: _, ...settled } = checkpoint
                const now = yield* DateTime.nowAsDate
                yield* tx
                  .update(jiraMigration)
                  .set({
                    checkpoint: yield* Schema.encodeEffect(
                      JiraMigrationCheckpoint
                    )(settled),
                    updatedAt: now
                  })
                  .where(fenceWhere(fence))
                return true
              })
            )
            .pipe(Effect.mapError(databaseError))
      const owned = Effect.fn("JiraMigrationProjection.owned")(function* (
        owner: ProjectionOwner,
        migrationId: string
      ) {
        const rows = yield* db
          .select()
          .from(jiraMigration)
          .where(
            and(
              eq(jiraMigration.id, migrationId),
              eq(jiraMigration.organizationId, owner.organizationId),
              eq(jiraMigration.initiatedBy, owner.userId)
            )
          )
          .limit(1)
          .pipe(Effect.mapError(databaseError))
        if (!rows[0]) return yield* new NotFound()
        return rows[0]
      })
      const ensureCreated = Effect.fn("JiraMigrationProjection.ensureCreated")(
        function* (input: EnsureCreatedInput) {
          const { source } = input
          yield* db
            .insert(jiraMigration)
            .values({
              id: input.executionId,
              requestId: input.requestId,
              organizationId: input.organizationId,
              initiatedBy: input.userId,
              sourceCloudId: source.cloudId,
              sourceSiteName: source.siteName,
              sourceSiteUrl: source.siteUrl,
              sourceProjectId: source.projectId,
              sourceProjectKey: source.projectKey,
              sourceProjectName: source.projectName,
              stagingPrefix: `migrations/jira/${input.executionId}`,
              workflowExecutionId: input.executionId,
              workflowAttempt: 1,
              scanRevision: 1
            })
            .onConflictDoNothing()
            .pipe(Effect.mapError(databaseError))
          const rows = yield* db
            .select()
            .from(jiraMigration)
            .where(
              and(
                eq(jiraMigration.organizationId, input.organizationId),
                eq(jiraMigration.initiatedBy, input.userId),
                eq(jiraMigration.requestId, input.requestId)
              )
            )
            .limit(1)
            .pipe(Effect.mapError(databaseError))
          const row = rows[0]
          if (
            !row ||
            row.id !== input.executionId ||
            row.workflowExecutionId === null ||
            !matchesSource(row, source)
          )
            return yield* new Conflict({
              reason: "jira_migration_request_conflict"
            })
          return row
        }
      )
      const beginRescan = Effect.fn("JiraMigrationProjection.beginRescan")(
        function* (input: BeginRescanInput) {
          const rows = yield* db
            .select()
            .from(jiraMigration)
            .where(eq(jiraMigration.id, input.migrationId))
            .limit(1)
            .pipe(Effect.mapError(databaseError))
          const row = rows[0]
          if (!row) return yield* conflict()
          const target = (value: JiraMigrationRow) =>
            value.workflowExecutionId === input.executionId &&
            value.workflowAttempt === input.workflowAttempt &&
            value.scanRevision === input.scanRevision
          if (target(row))
            return {
              ...row,
              supersededExecutionId: input.supersededExecutionId
            }
          if (
            row.workflowExecutionId !== input.supersededExecutionId ||
            row.revision !== input.expectedRevision ||
            input.workflowAttempt !== row.workflowAttempt + 1 ||
            input.scanRevision !== row.scanRevision + 1 ||
            !fenceFor(row)
          )
            return yield* conflict()
          if (!actionsFor(row).canRescan)
            return yield* new Validation({
              reason: "jira_migration_rescan_not_allowed"
            })
          if (
            (yield* decodeCheckpoint(row.checkpoint)).remoteWritesMayStillCommit
          )
            return yield* conflict()
          const now = yield* DateTime.nowAsDate
          const updated = yield* db
            .update(jiraMigration)
            .set({
              workflowExecutionId: input.executionId,
              workflowAttempt: input.workflowAttempt,
              scanRevision: input.scanRevision,
              revision: input.expectedRevision + 1,
              updatedAt: now,
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
              retainedUntil: null
            })
            .where(
              and(
                fenceWhere(fenceFor(row)!),
                eq(jiraMigration.revision, input.expectedRevision),
                eq(jiraMigration.status, row.status),
                isNull(jiraMigration.cleanupExecutionId)
              )
            )
            .returning()
            .pipe(Effect.mapError(databaseError))
          if (updated[0])
            return {
              ...updated[0],
              supersededExecutionId: input.supersededExecutionId
            }
          const replay = yield* db
            .select()
            .from(jiraMigration)
            .where(eq(jiraMigration.id, input.migrationId))
            .limit(1)
            .pipe(Effect.mapError(databaseError))
          if (replay[0] && target(replay[0]))
            return {
              ...replay[0],
              supersededExecutionId: input.supersededExecutionId
            }
          return yield* conflict()
        }
      )
      const updateRevision = Effect.fn(
        "JiraMigrationProjection.updateRevision"
      )(function* (
        row: JiraMigrationRow,
        expectedRevision: number,
        patch: Partial<typeof jiraMigration.$inferInsert>
      ) {
        const fence = fenceFor(row)
        if (!fence || row.revision !== expectedRevision)
          return yield* conflict()
        const now = yield* DateTime.nowAsDate
        const rows = yield* db
          .update(jiraMigration)
          .set({ ...patch, revision: expectedRevision + 1, updatedAt: now })
          .where(
            and(
              fenceWhere(fence),
              eq(jiraMigration.revision, expectedRevision),
              eq(jiraMigration.status, row.status),
              isNull(jiraMigration.cleanupExecutionId)
            )
          )
          .returning()
          .pipe(Effect.mapError(databaseError))
        if (!rows[0]) return yield* conflict()
        return yield* toDetail(rows[0])
      })
      const advance = Effect.fn("JiraMigrationProjection.advance")(function* (
        fence: AttemptFence,
        patch: ProjectionPatch
      ) {
        const now = yield* DateTime.nowAsDate
        const rows = yield* db
          .update(jiraMigration)
          .set({
            ...patch,
            ...(patch.checkpoint === undefined
              ? {}
              : {
                  checkpoint: sqlFragment`coalesce(${jiraMigration.checkpoint}, '{}'::jsonb) || (coalesce(${patch.checkpoint}::jsonb, '{}'::jsonb) - 'scanFailureReceipts' - 'scanPages' - 'currentGate' - 'acceptedConfiguration' - 'remoteWritesMayStillCommit' - 'publishedPlan')`
                }),
            updatedAt: now,
            revision: sqlFragment`${jiraMigration.revision} + 1`
          })
          .where(
            and(
              fenceWhere(fence),
              isNull(jiraMigration.cleanupExecutionId),
              ne(jiraMigration.status, "succeeded"),
              ne(jiraMigration.status, "cancelled"),
              ne(jiraMigration.status, "cancelling")
            )
          )
          .returning({ id: jiraMigration.id })
          .pipe(Effect.mapError(databaseError))
        return rows.length > 0
      })
      const recordFailure: JiraMigrationProjectionShape["recordFailure"] =
        Effect.fn("JiraMigrationProjection.recordFailure")(
          function* (fence, failure) {
            const now = yield* DateTime.now
            const rows = yield* db
              .update(jiraMigration)
              .set({
                status: failure.status ?? "failed",
                failureReason: failure.reason,
                failureRetryable: failure.retryable,
                failureSequence: sqlFragment`${jiraMigration.failureSequence} + 1`,
                checkpoint: sqlFragment`coalesce(${jiraMigration.checkpoint}, '{}'::jsonb) || case when ${jiraMigration.scanAt} is not null and not (coalesce(${jiraMigration.checkpoint}, '{}'::jsonb) ? 'acceptedConfiguration') then '{}'::jsonb else jsonb_build_object('currentGate', jsonb_build_object('version', 1, '_tag', 'Retry', 'failureSequence', ${jiraMigration.failureSequence} + 1, 'phase', case when ${jiraMigration.scanAt} is null then 'scan' else 'import' end)) end`,
                revision: sqlFragment`${jiraMigration.revision} + 1`,
                updatedAt: DateTime.toDate(now),
                finishedAt: DateTime.toDate(now),
                retainedUntil: DateTime.toDate(DateTime.add(now, { days: 30 }))
              })
              .where(
                and(
                  fenceWhere(fence),
                  isNull(jiraMigration.cleanupExecutionId),
                  ne(jiraMigration.status, "succeeded"),
                  ne(jiraMigration.status, "cancelled"),
                  ne(jiraMigration.status, "cancelling"),
                  ne(jiraMigration.status, "failed"),
                  ne(jiraMigration.status, "reconnect_required")
                )
              )
              .returning({ id: jiraMigration.id })
              .pipe(Effect.mapError(databaseError))
            return rows.length > 0
          }
        )
      const recordScanFailure: JiraMigrationProjectionShape["recordScanFailure"] =
        (fence, operationKey, failure) =>
          db
            .transaction((tx) =>
              Effect.gen(function* () {
                const rows = yield* tx
                  .select()
                  .from(jiraMigration)
                  .where(
                    and(
                      fenceWhere(fence),
                      isNull(jiraMigration.cleanupExecutionId)
                    )
                  )
                  .for("update")
                const row = rows[0]
                if (
                  !row ||
                  ["succeeded", "cancelled", "cancelling"].includes(row.status)
                )
                  return null
                const checkpoint = yield* decodeCheckpoint(row.checkpoint)
                const receipt = checkpoint.scanFailureReceipts?.[operationKey]
                if (receipt !== undefined) return receipt
                const alreadyFailed =
                  row.status === "failed" || row.status === "reconnect_required"
                const sequence = alreadyFailed
                  ? row.failureSequence
                  : row.failureSequence + 1
                const now = yield* DateTime.now
                yield* tx
                  .update(jiraMigration)
                  .set({
                    checkpoint: yield* Schema.encodeEffect(
                      JiraMigrationCheckpoint
                    )({
                      ...checkpoint,
                      ...(!alreadyFailed
                        ? {
                            currentGate: {
                              version: 1 as const,
                              _tag: "Retry" as const,
                              failureSequence: sequence,
                              phase: "scan" as const
                            }
                          }
                        : {}),
                      scanFailureReceipts: {
                        ...checkpoint.scanFailureReceipts,
                        [operationKey]: sequence
                      }
                    }),
                    ...(!alreadyFailed
                      ? {
                          status: failure.reconnect
                            ? ("reconnect_required" as const)
                            : ("failed" as const),
                          failureReason: failure.reason,
                          failureRetryable: failure.retryable,
                          failureSequence: sequence,
                          finishedAt: DateTime.toDate(now),
                          retainedUntil: DateTime.toDate(
                            DateTime.add(now, { days: 30 })
                          )
                        }
                      : {}),
                    updatedAt: DateTime.toDate(now),
                    revision: row.revision + 1
                  })
                  .where(fenceWhere(fence))
                return sequence
              })
            )
            .pipe(Effect.mapError(databaseError))
      const resumeScan: JiraMigrationProjectionShape["resumeScan"] = (
        fence,
        sequence
      ) =>
        db
          .transaction((tx) =>
            Effect.gen(function* () {
              const rows = yield* tx
                .select()
                .from(jiraMigration)
                .where(
                  and(
                    fenceWhere(fence),
                    isNull(jiraMigration.cleanupExecutionId)
                  )
                )
                .for("update")
              const row = rows[0]
              if (!row) return { _tag: "Rejected" } as const
              const scanned =
                row.scanAt !== null &&
                ["needs_configuration", "ready", "migrating"].includes(
                  row.status
                )
              const retryable =
                row.scanAt === null &&
                row.failureRetryable === true &&
                ["failed", "reconnect_required"].includes(row.status)
              if (!scanned && !retryable && row.status !== "scanning")
                return { _tag: "Rejected" } as const
              if (row.failureSequence > sequence)
                return {
                  _tag: "AwaitRetry",
                  failureSequence: row.failureSequence
                } as const
              if (row.failureSequence !== sequence)
                return { _tag: "Rejected" } as const
              if (scanned || row.status === "scanning")
                return { _tag: "Resumed" } as const
              const now = yield* DateTime.nowAsDate
              yield* tx
                .update(jiraMigration)
                .set({
                  status: "scanning",
                  failureReason: null,
                  failureRetryable: null,
                  finishedAt: null,
                  retainedUntil: null,
                  updatedAt: now,
                  revision: row.revision + 1
                })
                .where(
                  and(
                    fenceWhere(fence),
                    eq(jiraMigration.failureSequence, sequence),
                    isNull(jiraMigration.cleanupExecutionId)
                  )
                )
              return { _tag: "Resumed" } as const
            })
          )
          .pipe(Effect.mapError(databaseError))
      const recordScanProgress: JiraMigrationProjectionShape["recordScanProgress"] =
        (fence, pageKey, count) =>
          db
            .transaction((tx) =>
              Effect.gen(function* () {
                const rows = yield* tx
                  .select()
                  .from(jiraMigration)
                  .where(
                    and(
                      fenceWhere(fence),
                      isNull(jiraMigration.cleanupExecutionId)
                    )
                  )
                  .for("update")
                const row = rows[0]
                if (
                  !row ||
                  !["scanning", "failed", "reconnect_required"].includes(
                    row.status
                  )
                )
                  return false
                const checkpoint = yield* decodeCheckpoint(row.checkpoint)
                if (checkpoint.scanPages?.[pageKey] !== undefined) return true
                const scanPages = { ...checkpoint.scanPages, [pageKey]: count }
                const now = yield* DateTime.nowAsDate
                yield* tx
                  .update(jiraMigration)
                  .set({
                    checkpoint: yield* Schema.encodeEffect(
                      JiraMigrationCheckpoint
                    )({ ...checkpoint, scanPages }),
                    progressDone: Object.values(scanPages).reduce(
                      (sum, value) => sum + value,
                      0
                    ),
                    updatedAt: now,
                    revision: row.revision + 1
                  })
                  .where(fenceWhere(fence))
                return true
              })
            )
            .pipe(Effect.mapError(databaseError))
      const completeScan: JiraMigrationProjectionShape["completeScan"] = (
        fence,
        scan
      ) =>
        db
          .transaction((tx) =>
            Effect.gen(function* () {
              const rows = yield* tx
                .select()
                .from(jiraMigration)
                .where(
                  and(
                    fenceWhere(fence),
                    isNull(jiraMigration.cleanupExecutionId)
                  )
                )
                .for("update")
              const row = rows[0]
              if (!row) return false
              const checkpoint = yield* decodeCheckpoint(row.checkpoint)
              if (
                ["needs_configuration", "ready", "migrating"].includes(
                  row.status
                ) &&
                row.scanAt !== null
              ) {
                const persisted = checkpoint.scan?.manifest
                return (
                  persisted !== undefined &&
                  persisted.key === scan.manifest.key &&
                  persisted.sha256 === scan.manifest.sha256 &&
                  persisted.byteSize === scan.manifest.byteSize &&
                  persisted.contentType === scan.manifest.contentType
                )
              }
              if (row.status !== "scanning") return false
              const encoded = yield* Schema.encodeEffect(
                JiraMigrationCheckpoint
              )({
                ...checkpoint,
                scan,
                currentGate: {
                  version: 1,
                  _tag: "StartImport",
                  scanRevision: row.scanRevision
                }
              })
              const now = yield* DateTime.nowAsDate
              yield* tx
                .update(jiraMigration)
                .set({
                  checkpoint: encoded,
                  status: "needs_configuration",
                  phase: "configuration",
                  scanAt: DateTime.toDate(scan.summary.scannedAt),
                  manifestVersion: 2,
                  progressTotal: row.progressDone,
                  updatedAt: now,
                  revision: row.revision + 1
                })
                .where(fenceWhere(fence))
              return true
            })
          )
          .pipe(Effect.mapError(databaseError))
      const saveConfiguration = Effect.fn(
        "JiraMigrationProjection.saveConfiguration"
      )(function* (input: SaveConfigurationInput) {
        const row = yield* owned(input.owner, input.migrationId)
        if (row.revision !== input.expectedRevision) return yield* conflict()
        if (!actionsFor(row).canConfigure)
          return yield* new Validation({
            reason: "jira_migration_not_configurable"
          })
        const checkpoint = yield* decodeCheckpoint(row.checkpoint)
        if (!checkpoint.scan)
          return yield* new Validation({
            reason: "jira_migration_scan_incomplete"
          })
        if (row.destinationProjectId !== null) {
          const accepted = checkpoint.acceptedConfiguration?.configuration
          if (
            !accepted ||
            !isAllowedAttachmentCorrection(
              accepted,
              input.configuration,
              input.unresolvedFailedAttachmentIds ?? []
            )
          )
            return yield* new Validation({
              reason: "jira_migration_not_configurable"
            })
        }
        const complete = isCompleteJiraConfiguration(
          input.configuration,
          checkpoint.scan.requirements
        )
        return yield* updateRevision(row, input.expectedRevision, {
          configuration: input.configuration,
          status: complete ? "ready" : "needs_configuration",
          phase: complete ? "ready" : "configuration",
          failureReason: null,
          failureRetryable: null,
          finishedAt: null,
          retainedUntil: null
        })
      })
      const transition = Effect.fn("JiraMigrationProjection.transition")(
        function* (input: TransitionInput) {
          const row = yield* owned(input.owner, input.migrationId)
          if (row.revision !== input.expectedRevision) return yield* conflict()
          if (input.action === "run") {
            if (!actionsFor(row).canRun)
              return yield* new Validation({
                reason: "jira_migration_run_not_allowed"
              })
            const checkpoint = yield* decodeCheckpoint(row.checkpoint)
            const gate = checkpoint.currentGate
            const scanRetry =
              gate?._tag === "Retry"
                ? gate.phase === "scan"
                : row.scanAt === null
            const configuration = yield* decodeConfiguration(row.configuration)
            if (
              !scanRetry &&
              (!configuration ||
                !checkpoint.scan ||
                !isCompleteJiraConfiguration(
                  configuration,
                  checkpoint.scan.requirements
                ))
            )
              return yield* new Validation({
                reason: "jira_migration_run_not_allowed"
              })
            const acceptedConfiguration = scanRetry
              ? checkpoint.acceptedConfiguration
              : checkpoint.acceptedConfiguration &&
                  Schema.toEquivalence(JiraMigrationConfiguration)(
                    checkpoint.acceptedConfiguration.configuration,
                    configuration!
                  )
                ? checkpoint.acceptedConfiguration
                : {
                    configurationRevision: input.expectedRevision + 1,
                    configuration: configuration!
                  }
            const acceptedCheckpoint = yield* Schema.encodeEffect(
              JiraMigrationCheckpoint
            )({ acceptedConfiguration }).pipe(Effect.mapError(databaseError))
            return yield* updateRevision(row, input.expectedRevision, {
              status: scanRetry ? "scanning" : "migrating",
              phase: scanRetry ? "queued_scan" : "migrate",
              checkpoint:
                sqlFragment`coalesce(${jiraMigration.checkpoint}, '{}'::jsonb) || ${acceptedCheckpoint}::jsonb` as unknown as JiraMigrationRow["checkpoint"],
              failureReason: null,
              failureRetryable: null,
              finishedAt: null,
              retainedUntil: null
            })
          }
          if (!actionsFor(row).canCancel)
            return yield* new Validation({
              reason: "jira_migration_cancel_not_allowed"
            })
          const active = ["scanning", "migrating", "cancelling"].includes(
            row.status
          )
          const now = yield* DateTime.now
          return yield* updateRevision(row, input.expectedRevision, {
            status: active ? "cancelling" : "cancelled",
            phase: active ? "cancelling" : "cancelled",
            finishedAt: active ? null : DateTime.toDate(now),
            retainedUntil: active
              ? null
              : DateTime.toDate(DateTime.add(now, { days: 30 }))
          })
        }
      )
      const finalizeInterrupted: JiraMigrationProjectionShape["finalizeInterrupted"] =
        Effect.fn("JiraMigrationProjection.finalizeInterrupted")(
          function* (fence) {
            const now = yield* DateTime.now
            const rows = yield* db
              .update(jiraMigration)
              .set({
                status: "cancelled",
                phase: "cancelled",
                finishedAt: DateTime.toDate(now),
                retainedUntil: DateTime.toDate(DateTime.add(now, { days: 30 })),
                updatedAt: DateTime.toDate(now),
                revision: sqlFragment`${jiraMigration.revision} + 1`
              })
              .where(
                and(
                  fenceWhere(fence),
                  eq(jiraMigration.status, "cancelling"),
                  isNull(jiraMigration.cleanupExecutionId)
                )
              )
              .returning({ id: jiraMigration.id })
              .pipe(Effect.mapError(databaseError))
            return rows.length > 0
          }
        )
      const claimCleanup: JiraMigrationProjectionShape["claimCleanup"] =
        Effect.fn("JiraMigrationProjection.claimCleanup")(
          function* (fence, input) {
            const now = yield* DateTime.nowAsDate
            const rows = yield* db
              .update(jiraMigration)
              .set({
                cleanupExecutionId: input.executionId,
                updatedAt: now,
                revision: input.expectedRevision + 1
              })
              .where(
                and(
                  fenceWhere(fence),
                  eq(jiraMigration.revision, input.expectedRevision),
                  isNull(jiraMigration.cleanupExecutionId),
                  sqlFragment`not (coalesce(${jiraMigration.checkpoint}, '{}'::jsonb) ? 'remoteWritesMayStillCommit')`,
                  input.mode === "reset_import"
                    ? isNotNull(jiraMigration.destinationProjectId)
                    : undefined,
                  inArray(jiraMigration.status, cleanupStatusesFor(input.mode))
                )
              )
              .returning({ id: jiraMigration.id })
              .pipe(Effect.mapError(databaseError))
            if (rows.length > 0) return true
            const replay = yield* db
              .select({ id: jiraMigration.id })
              .from(jiraMigration)
              .where(
                and(
                  fenceWhere(fence),
                  eq(jiraMigration.cleanupExecutionId, input.executionId),
                  inArray(jiraMigration.status, cleanupStatusesFor(input.mode))
                )
              )
              .limit(1)
              .pipe(Effect.mapError(databaseError))
            return replay.length > 0
          }
        )
      const releaseCleanup: JiraMigrationProjectionShape["releaseCleanup"] =
        Effect.fn("JiraMigrationProjection.releaseCleanup")(
          function* (fence, executionId, mode) {
            const now = yield* DateTime.nowAsDate
            const rows = yield* db
              .update(jiraMigration)
              .set({
                cleanupExecutionId: null,
                updatedAt: now,
                revision: sqlFragment`${jiraMigration.revision} + 1`
              })
              .where(
                and(
                  fenceWhere(fence),
                  eq(jiraMigration.cleanupExecutionId, executionId),
                  inArray(jiraMigration.status, cleanupStatusesFor(mode))
                )
              )
              .returning({ id: jiraMigration.id })
              .pipe(Effect.mapError(databaseError))
            return rows.length > 0
          }
        )
      const deleteAfterCleanup: JiraMigrationProjectionShape["deleteAfterCleanup"] =
        Effect.fn("JiraMigrationProjection.deleteAfterCleanup")(
          function* (fence, executionId) {
            const rows = yield* db
              .delete(jiraMigration)
              .where(
                and(
                  fenceWhere(fence),
                  eq(jiraMigration.cleanupExecutionId, executionId),
                  sqlFragment`not (coalesce(${jiraMigration.checkpoint}, '{}'::jsonb) ? 'remoteWritesMayStillCommit')`,
                  inArray(jiraMigration.status, cleanupStatuses)
                )
              )
              .returning({ id: jiraMigration.id })
              .pipe(Effect.mapError(databaseError))
            return rows.length > 0
          }
        )
      return JiraMigrationProjection.of({
        beginRemoteWrites,
        settleRemoteWrites,
        ensureCreated,
        finalizeInterrupted,
        beginRescan,
        advance,
        recordFailure,
        recordScanFailure,
        resumeScan,
        recordScanProgress,
        completeScan,
        saveConfiguration,
        claimCleanup,
        releaseCleanup,
        deleteAfterCleanup,
        owned,
        listOwned: (owner) =>
          db
            .select()
            .from(jiraMigration)
            .where(
              and(
                eq(jiraMigration.organizationId, owner.organizationId),
                eq(jiraMigration.initiatedBy, owner.userId)
              )
            )
            .orderBy(desc(jiraMigration.createdAt))
            .pipe(Effect.mapError(databaseError)),
        transition,
        toDetail,
        actionsFor
      })
    })
  )
}
