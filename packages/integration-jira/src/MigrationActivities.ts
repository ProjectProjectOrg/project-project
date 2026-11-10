// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import { JiraError } from "@pp/shared"
import {
  JiraMigrationRequirements,
  JiraMigrationScanSummary,
  JiraMigrationUserOption,
  type JiraMigrationFinding
} from "@pp/shared"
import { Option, Schedule, Semaphore } from "effect"
import { DateTime } from "effect"
import * as Effect from "effect/Effect"
import type * as Exit from "effect/Exit"
import * as Match from "effect/Match"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { Activity } from "effect/workflow"

import { JiraRateLimited, JiraTransientFailure } from "./Blocked"
import type * as Client from "./Client"
import type { JiraOffsetPage } from "./ClientSchemas"
import { jiraFinding } from "./Findings"
import { canonicalJiraJson, isCoverageLimited } from "./Manifest"
import * as MigrationArtifacts from "./MigrationArtifacts"
import type * as MigrationProjection from "./MigrationProjection"
import type {
  JiraMigrationWorkflowFailure,
  JiraMigrationWorkflowFailureValue,
  JiraMigrationWorkflowPayloadValue
} from "./MigrationWorkflow"
import { JiraAttachmentOutcome } from "./PublicationPlan"
import {
  JiraScanKind,
  OPTIONAL_SCAN_KINDS,
  SKIPPABLE_SCAN_KINDS
} from "./scanKinds"
import {
  prepareScanV2,
  buildScanManifestV2,
  normalizeScanPageValues,
  type ScanChunkReference
} from "./ScanV2"

const decodeUnknownJiraMigrationUserOptionArray = Schema.decodeUnknownEffect(
  Schema.Array(JiraMigrationUserOption)
)

const encodeJiraAttachmentOutcomeArray = Schema.encodeEffect(
  Schema.Array(JiraAttachmentOutcome)
)

const decodeUnknownArray = Schema.decodeUnknownEffect(Schema.Array(Schema.Json))

export const VerifiedJiraMaterialization = Schema.Struct({
  planSha256: Schema.String,
  documentCount: Schema.Int,
  attachmentCount: Schema.Int,
  unresolvedReferenceCount: Schema.Literal(0)
})
export type VerifiedJiraMaterialization =
  typeof VerifiedJiraMaterialization.Type

export type JiraReadyPublication = Readonly<{
  projectId: string
  planRef: MigrationArtifacts.JiraArtifactRef
  verified: VerifiedJiraMaterialization
}>

export type JiraMaterializationDependencies<
  A extends Readonly<{ sourceAttachmentId: string }>,
  R
> = Readonly<{
  error: typeof JiraMigrationWorkflowFailure
  createHidden: Effect.Effect<string, JiraMigrationWorkflowFailureValue, R>
  copyAttachment: (
    attachment: A
  ) => Effect.Effect<
    JiraAttachmentOutcome,
    JiraMigrationWorkflowFailureValue,
    R
  >
  finalizePlan: (
    outcomes: ReadonlyArray<JiraAttachmentOutcome>
  ) => Effect.Effect<
    Readonly<{
      planRef: MigrationArtifacts.JiraArtifactRef
      publicationRevision: string
      documentBatchCount: number
    }>,
    JiraMigrationWorkflowFailureValue,
    R
  >
  writeDocumentBatch: (
    planRef: MigrationArtifacts.JiraArtifactRef,
    ordinal: number
  ) => Effect.Effect<number, JiraMigrationWorkflowFailureValue, R>
  writeArchive: (
    planRef: MigrationArtifacts.JiraArtifactRef
  ) => Effect.Effect<number, JiraMigrationWorkflowFailureValue, R>
  writeReport: (
    planRef: MigrationArtifacts.JiraArtifactRef
  ) => Effect.Effect<number, JiraMigrationWorkflowFailureValue, R>
  verify: (
    planRef: MigrationArtifacts.JiraArtifactRef
  ) => Effect.Effect<
    VerifiedJiraMaterialization,
    JiraMigrationWorkflowFailureValue,
    R
  >
  beginStage: (
    phase: JiraImportPhase,
    total: number
  ) => Effect.Effect<void, JiraMigrationWorkflowFailureValue, R>
  resumeWrites: (
    operationKey: string
  ) => Effect.Effect<void, JiraMigrationWorkflowFailureValue, R>
}>

export type JiraImportPhase =
  | "import_prepare"
  | "import_attachments"
  | "import_documents"
  | "import_verify"
  | "import_publish"

export type ImportUnitOptions<R> = Readonly<{
  onResume?: (
    operationKey: string
  ) => Effect.Effect<void, JiraMigrationWorkflowFailureValue, R>
}>

export type ImportUnitRunner<R0 = never> = <A, R, R2 = never>(
  logicalName: string,
  run: (
    operationTry: number
  ) => Effect.Effect<A, JiraMigrationWorkflowFailureValue, R>,
  options?: ImportUnitOptions<R2>
) => Effect.Effect<
  A,
  JiraMigrationWorkflowFailureValue,
  | R
  | R2
  | R0
  | import("effect/workflow/WorkflowEngine").WorkflowEngine
  | import("effect/workflow/WorkflowEngine").WorkflowInstance
>

export const AUTOMATIC_RETRY_BUDGET = 8
const MAX_RETRY_DELAY_MILLIS = 15 * 60 * 1000
const MATERIALIZATION_CONCURRENCY = 4

export const automaticRetryDelayMillis = (
  attempt: number,
  seed: string,
  retryAfterMillis = 0
) => {
  const base = Math.min(5000 * 2 ** attempt, 120_000)
  const fraction =
    Number.parseInt(
      createHash("sha256")
        .update(`${seed}/${attempt}`)
        .digest("hex")
        .slice(0, 8),
      16
    ) / 0xffffffff
  return Math.min(
    Math.max(Math.round(base * (0.8 + 0.4 * fraction)), retryAfterMillis),
    MAX_RETRY_DELAY_MILLIS
  )
}

const HEARTBEAT_INTERVAL = "5 minutes"

export const withHeartbeat = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  heartbeat: Effect.Effect<unknown, JiraError>
): Effect.Effect<A, E, R> =>
  Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.forkScoped(
        Effect.repeat(
          heartbeat.pipe(Effect.ignore),
          Schedule.spaced(HEARTBEAT_INTERVAL)
        )
      )
      return yield* effect
    })
  )

export const beginImportStage = <R, R0>(
  unit: ImportUnitRunner<R0>,
  input: Readonly<{ scanRevision: number; configurationRevision: number }>,
  error: typeof JiraMigrationWorkflowFailure,
  phase: JiraImportPhase,
  total: number,
  execute: (
    phase: JiraImportPhase,
    total: number
  ) => Effect.Effect<void, JiraMigrationWorkflowFailureValue, R>
) =>
  unit(
    `import/stage/${phase}/${input.scanRevision}/${input.configurationRevision}`,
    (operationTry) =>
      Activity.make({
        name: activityName([
          "import",
          "stage",
          phase,
          input.scanRevision,
          input.configurationRevision,
          operationTry
        ]),
        success: Schema.Void,
        error,
        execute: execute(phase, total)
      })
  )

export const prepareJiraPublicationReference = <R>(
  input: Readonly<{
    scanRevision: number
    configurationRevision: number
    operationTry?: number
  }>,
  dependencies: Readonly<{
    error: typeof JiraMigrationWorkflowFailure
    prepare: Effect.Effect<
      MigrationArtifacts.JiraArtifactRef,
      JiraMigrationWorkflowFailureValue,
      R
    >
  }>
) =>
  Activity.make({
    name: jiraPreflightActivityName(
      input.scanRevision,
      input.configurationRevision,
      input.operationTry ?? 0
    ),
    success: MigrationArtifacts.JiraArtifactRef,
    error: dependencies.error,
    execute: dependencies.prepare
  })

const sortedAttachments = <A extends Readonly<{ sourceAttachmentId: string }>>(
  attachments: ReadonlyArray<A>
) =>
  attachments.toSorted((a, b) =>
    a.sourceAttachmentId < b.sourceAttachmentId
      ? -1
      : a.sourceAttachmentId > b.sourceAttachmentId
        ? 1
        : 0
  )

export const materializeJiraPreparedPublication = <
  A extends Readonly<{ sourceAttachmentId: string }>,
  R,
  R0
>(
  input: Readonly<{
    scanRevision: number
    configurationRevision: number
    attachments: ReadonlyArray<A>
  }>,
  dependencies: JiraMaterializationDependencies<A, R>,
  unit: ImportUnitRunner<R0>
) =>
  Effect.gen(function* () {
    const options = { onResume: dependencies.resumeWrites }
    const revisions = `${input.scanRevision}/${input.configurationRevision}`
    const projectId = yield* unit(
      `import/create-hidden/${revisions}`,
      (operationTry) =>
        Activity.make({
          name: jiraCreateHiddenActivityName(
            input.scanRevision,
            input.configurationRevision,
            operationTry
          ),
          success: Schema.String,
          error: dependencies.error,
          execute: dependencies.createHidden
        }),
      options
    )
    const attachments = sortedAttachments(input.attachments)
    yield* beginImportStage(
      unit,
      input,
      dependencies.error,
      "import_attachments",
      attachments.length,
      dependencies.beginStage
    )
    const outcomes = yield* Effect.forEach(
      attachments,
      (attachment) =>
        unit(
          `import/attachment/${encodeURIComponent(attachment.sourceAttachmentId)}`,
          (operationTry) =>
            Activity.make({
              name: jiraCopyAttachmentActivityName(
                attachment.sourceAttachmentId,
                operationTry
              ),
              success: JiraAttachmentOutcome,
              error: dependencies.error,
              execute: dependencies.copyAttachment(attachment)
            }),
          options
        ),
      { concurrency: MATERIALIZATION_CONCURRENCY }
    )
    const encodedOutcomes = yield* encodeJiraAttachmentOutcomeArray(
      outcomes
    ).pipe(
      Effect.mapError(() =>
        dependencies.error.make({
          reason: "jira_migration_attachment_outcome_invalid",
          retryable: false
        })
      )
    )
    const outcomeSetSha256 = createHash("sha256")
      .update(canonicalJiraJson(encodedOutcomes))
      .digest("hex")
    const finalized = yield* unit(
      `import/finalize-plan/${revisions}/${outcomeSetSha256}`,
      (operationTry) =>
        Activity.make({
          name: jiraFinalizePlanActivityName(
            input.scanRevision,
            input.configurationRevision,
            outcomeSetSha256,
            operationTry
          ),
          success: Schema.Struct({
            planRef: MigrationArtifacts.JiraArtifactRef,
            publicationRevision: Schema.String,
            documentBatchCount: Schema.Int
          }),
          error: dependencies.error,
          execute: dependencies.finalizePlan(outcomes)
        }),
      options
    )
    const revision = finalized.publicationRevision
    yield* beginImportStage(
      unit,
      input,
      dependencies.error,
      "import_documents",
      finalized.documentBatchCount + 2,
      dependencies.beginStage
    )
    for (let ordinal = 0; ordinal < finalized.documentBatchCount; ordinal++)
      yield* unit(
        `import/write-documents/${revision}/${ordinal}`,
        (operationTry) =>
          Activity.make({
            name: jiraWriteDocumentsActivityName(
              revision,
              ordinal,
              operationTry
            ),
            success: Schema.Int,
            error: dependencies.error,
            execute: dependencies.writeDocumentBatch(finalized.planRef, ordinal)
          }),
        options
      )
    yield* unit(
      `import/write-archive/${revision}`,
      (operationTry) =>
        Activity.make({
          name: jiraPublicationActivityName(
            "write-archive",
            revision,
            operationTry
          ),
          success: Schema.Int,
          error: dependencies.error,
          execute: dependencies.writeArchive(finalized.planRef)
        }),
      options
    )
    yield* unit(
      `import/write-report/${revision}`,
      (operationTry) =>
        Activity.make({
          name: jiraPublicationActivityName(
            "write-report",
            revision,
            operationTry
          ),
          success: Schema.Int,
          error: dependencies.error,
          execute: dependencies.writeReport(finalized.planRef)
        }),
      options
    )
    yield* beginImportStage(
      unit,
      input,
      dependencies.error,
      "import_verify",
      1,
      dependencies.beginStage
    )
    const verified = yield* unit(
      `import/verify/${revision}`,
      (operationTry) =>
        Activity.make({
          name: jiraPublicationActivityName("verify", revision, operationTry),
          success: VerifiedJiraMaterialization,
          error: dependencies.error,
          execute: dependencies.verify(finalized.planRef)
        }),
      options
    )
    if (verified.planSha256 !== finalized.publicationRevision)
      return yield* Effect.fail(
        dependencies.error.make({
          reason: "jira_migration_plan_mismatch",
          retryable: false
        })
      )
    return { projectId, planRef: finalized.planRef, verified }
  })

export const publishJiraPreparedPublication = <R, R0>(
  ready: Readonly<{
    planRef: MigrationArtifacts.JiraArtifactRef
    verified: VerifiedJiraMaterialization
  }>,
  dependencies: Readonly<{
    error: typeof JiraMigrationWorkflowFailure
    publish: (
      planRef: MigrationArtifacts.JiraArtifactRef,
      verified: VerifiedJiraMaterialization
    ) => Effect.Effect<boolean, JiraMigrationWorkflowFailureValue, R>
  }>,
  unit: ImportUnitRunner<R0>
) =>
  unit(`import/publish/${ready.verified.planSha256}`, (operationTry) =>
    Activity.make({
      name: jiraPublicationActivityName(
        "publish",
        ready.verified.planSha256,
        operationTry
      ),
      success: Schema.Boolean,
      error: dependencies.error,
      execute: dependencies.publish(ready.planRef, ready.verified)
    })
  )

export type MigrationActivityInput = Readonly<{
  payload: JiraMigrationWorkflowPayloadValue
  executionId: string
}>

export type MigrationActivities<R = never> = Readonly<{
  scan: (
    input: MigrationActivityInput
  ) => Effect.Effect<
    void,
    JiraMigrationWorkflowFailureValue,
    | R
    | import("effect/workflow/WorkflowEngine").WorkflowEngine
    | import("effect/workflow/WorkflowEngine").WorkflowInstance
  >
  materialize: (
    input: MigrationActivityInput,
    unit: ImportUnitRunner<R>
  ) => Effect.Effect<
    JiraReadyPublication,
    JiraMigrationWorkflowFailureValue,
    | R
    | import("effect/workflow/WorkflowEngine").WorkflowEngine
    | import("effect/workflow/WorkflowEngine").WorkflowInstance
  >
  publish: (
    input: MigrationActivityInput,
    ready: JiraReadyPublication,
    unit: ImportUnitRunner<R>
  ) => Effect.Effect<
    void,
    JiraMigrationWorkflowFailureValue,
    | R
    | import("effect/workflow/WorkflowEngine").WorkflowEngine
    | import("effect/workflow/WorkflowEngine").WorkflowInstance
  >
  heartbeat: (input: MigrationActivityInput) => Effect.Effect<void, never, R>
  start: (
    input: MigrationActivityInput
  ) => Effect.Effect<void, JiraMigrationWorkflowFailureValue, R>
  finalize: (
    input: Readonly<{
      executionId: string
      exit: Exit.Exit<unknown, unknown>
    }>
  ) => Effect.Effect<void, never, R>
  recordImportFailure: (
    input: MigrationActivityInput,
    operationKey: string,
    failure: JiraMigrationWorkflowFailureValue
  ) => Effect.Effect<number | null, JiraMigrationWorkflowFailureValue, R>
  resumeImport: (
    input: MigrationActivityInput,
    failureSequence: number
  ) => Effect.Effect<
    MigrationProjection.JiraScanResumeResult,
    JiraMigrationWorkflowFailureValue,
    R
  >
}>

export const activityName = (parts: ReadonlyArray<string | number>) =>
  `v1/${parts.map(String).join("/")}`

export const JIRA_DOCUMENT_BATCH_SIZE = 32

export const jiraDocumentBatches = <A extends Readonly<{ path: string }>>(
  documents: ReadonlyArray<A>
): ReadonlyArray<ReadonlyArray<A>> => {
  const sorted = documents.toSorted((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  )
  if (new Set(sorted.map(({ path }) => path)).size !== sorted.length)
    throw new Error("Duplicate Jira publication document path")
  const batches: Array<ReadonlyArray<A>> = []
  for (
    let offset = 0;
    offset < sorted.length;
    offset += JIRA_DOCUMENT_BATCH_SIZE
  )
    batches.push(sorted.slice(offset, offset + JIRA_DOCUMENT_BATCH_SIZE))
  return batches
}

export const jiraPreflightActivityName = (
  scanRevision: number,
  configurationRevision: number,
  operationTry: number
) =>
  activityName([
    "import",
    "preflight",
    scanRevision,
    configurationRevision,
    operationTry
  ])

export const jiraCreateHiddenActivityName = (
  scanRevision: number,
  configurationRevision: number,
  operationTry: number
) =>
  activityName([
    "import",
    "create-hidden",
    scanRevision,
    configurationRevision,
    operationTry
  ])

export const jiraFinalizePlanActivityName = (
  scanRevision: number,
  configurationRevision: number,
  outcomeSetSha256: string,
  operationTry: number
) =>
  activityName([
    "import",
    "finalize-plan",
    scanRevision,
    configurationRevision,
    outcomeSetSha256,
    operationTry
  ])

export const jiraCopyAttachmentActivityName = (
  sourceAttachmentId: string,
  operationTry: number
) =>
  activityName([
    "import",
    "attachment",
    encodeURIComponent(sourceAttachmentId),
    operationTry
  ])

export const jiraWriteDocumentsActivityName = (
  publicationRevision: string,
  batchOrdinal: number,
  operationTry: number
) =>
  activityName([
    "import",
    "write-documents",
    publicationRevision,
    "batch",
    batchOrdinal,
    operationTry
  ])

export const jiraPublicationActivityName = (
  operation: "write-archive" | "write-report" | "verify" | "publish",
  publicationRevision: string,
  operationTry: number
) => activityName(["import", operation, publicationRevision, operationTry])

export const defineStartMigrationActivity = <R>(
  execute: Effect.Effect<void, JiraMigrationWorkflowFailureValue, R>,
  error: typeof JiraMigrationWorkflowFailure
) =>
  Activity.make({
    name: activityName(["start"]),
    success: Schema.Void,
    error,
    execute
  })

export const defineFinalizeMigrationActivity = <R>(
  execute: Effect.Effect<void, never, R>
) =>
  Activity.make({
    name: activityName(["finalize"]),
    success: Schema.Void,
    execute
  })

export const JiraScanContext = Schema.Struct({
  migrationId: Schema.NonEmptyString,
  workflowExecutionId: Schema.NonEmptyString,
  workflowAttempt: Schema.Int,
  scanRevision: Schema.Int,
  orgSlug: Schema.NonEmptyString,
  userId: Schema.NonEmptyString,
  cloudId: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  siteName: Schema.String,
  siteUrl: Schema.String,
  scannedAt: Schema.String
})
export type JiraScanContext = typeof JiraScanContext.Type
export const JiraScanPageInput = Schema.Struct({
  ...JiraScanContext.fields,
  kind: JiraScanKind,
  parentId: Schema.NullOr(Schema.String),
  cursor: Schema.NullOr(Schema.String),
  pageOrdinal: Schema.Int,
  operationTry: Schema.Int
})
export type JiraScanPageInput = typeof JiraScanPageInput.Type
export const JiraScanPageResult = Schema.Struct({
  raw: MigrationArtifacts.JiraArtifactRef,
  normalized: MigrationArtifacts.JiraArtifactRef,
  count: Schema.Int,
  nextCursor: Schema.NullOr(Schema.String),
  warnings: Schema.Array(Schema.String)
})
export type JiraScanPageResult = typeof JiraScanPageResult.Type
export class JiraScanFailure extends Schema.TaggedError<JiraScanFailure>()(
  "JiraScanFailure",
  {
    reason: Schema.String,
    retryable: Schema.Boolean,
    reconnect: Schema.Boolean,
    transient: Schema.optional(Schema.Boolean),
    subject: Schema.optional(Schema.String),
    detail: Schema.optional(Schema.String)
  }
) {}
export const JiraScanPageError = Schema.Union([
  JiraRateLimited,
  JiraTransientFailure,
  JiraScanFailure
])
export type JiraScanPageError = typeof JiraScanPageError.Type
export const scanFailure = (
  reason: string,
  retryable = false,
  reconnect = false
) => new JiraScanFailure({ reason, retryable, reconnect })
export const transientScanFailure = (reason: string) =>
  new JiraScanFailure({
    reason,
    retryable: true,
    reconnect: false,
    transient: true
  })

const TRANSIENT_JIRA_ERROR_REASONS = new Set([
  "network",
  "timeout",
  "server_error",
  "refresh_contention"
])

const fact = <S extends Schema.Top>(schema: S) =>
  Schema.optional(
    Schema.NullOr(schema).pipe(
      Schema.catchDecoding(() => Effect.succeedSome(null))
    )
  )
const ErrorFacts = Schema.Struct({
  _tag: fact(Schema.String),
  reason: fact(Schema.String),
  status: fact(Schema.Finite),
  operation: fact(Schema.String),
  path: fact(Schema.String),
  errorMessages: fact(Schema.Array(Schema.String)),
  key: fact(Schema.String),
  reasons: fact(Schema.Array(Schema.String)),
  retryAfterMillis: fact(Schema.Finite)
})
const decodeErrorFacts = Schema.decodeUnknownOption(ErrorFacts)
const errorFacts = (error: unknown) =>
  Option.getOrElse(decodeErrorFacts(error), (): typeof ErrorFacts.Type => ({}))

export const errorDetail = (error: unknown): string | undefined => {
  const facts = errorFacts(error)
  const parts = [
    facts._tag,
    facts.reason,
    facts.status == null ? null : `HTTP ${facts.status}`,
    facts.operation,
    facts.path,
    facts.errorMessages?.join("; ") || null,
    facts.key,
    facts.reasons?.join(", ")
  ].filter(Predicate.isString)
  return parts.length === 0 ? undefined : parts.join(": ")
}

export type JiraFailureClassification = Readonly<{
  reason: string
  retryable: boolean
  transient?: boolean
  reconnect?: boolean
  retryAfterMillis?: number
  detail?: string
}>

const classified = (
  error: unknown,
  reason: string,
  retryable: boolean,
  extra: Omit<JiraFailureClassification, "reason" | "retryable"> = {}
): JiraFailureClassification => {
  const detail = errorDetail(error)
  return {
    reason,
    retryable,
    ...extra,
    ...(detail === undefined ? {} : { detail })
  }
}

const transientClassified = (error: unknown, reason: string) => {
  const retryAfterMillis = errorFacts(error).retryAfterMillis
  return classified(error, reason, true, {
    transient: true,
    ...(retryAfterMillis == null ? {} : { retryAfterMillis })
  })
}

export const classifyJiraFailure = (
  error: unknown
): JiraFailureClassification | null => {
  const facts = errorFacts(error)
  switch (facts._tag) {
    case "JiraNotConnected":
    case "JiraReconnectRequired":
      return classified(error, "jira_reconnect_required", true, {
        reconnect: true
      })
    case "StorageNotConnected":
    case "StorageConfigMissing":
      return classified(error, "jira_migration_storage_unavailable", true)
    case "S3Unavailable":
      return transientClassified(error, "jira_migration_storage_failed")
    case "JiraArtifactError":
      return facts.reason === "write_intent"
        ? transientClassified(error, "jira_migration_database_failed")
        : classified(error, "jira_migration_storage_failed", true)
    case "MarkdownError":
      return classified(error, "jira_migration_markdown_failed", true)
    case "JiraAccessDenied":
      return classified(error, "jira_project_access_lost", true)
    case "JiraResourceNotFound":
      return classified(error, "jira_project_not_found", true)
    case "JiraRateLimited":
      return transientClassified(error, "jira_rate_limited")
    case "JiraTransientFailure":
      return transientClassified(error, "jira_unavailable")
    case "SqlError":
      return transientClassified(error, "jira_migration_database_failed")
    case "JiraError":
      return TRANSIENT_JIRA_ERROR_REASONS.has(facts.reason ?? "")
        ? classified(error, "jira_migration_temporarily_unavailable", true, {
            transient: true
          })
        : facts.reason === "cursor_expired"
          ? classified(error, "jira_migration_scan_incomplete", true)
          : null
    default:
      return null
  }
}

export const scanError = (error: unknown): JiraScanFailure => {
  const failure =
    classifyJiraFailure(error) ??
    classified(error, "jira_migration_invalid_response", false)
  return new JiraScanFailure({
    reason: failure.reason,
    retryable: failure.retryable,
    reconnect: failure.reconnect === true,
    ...(failure.transient === undefined
      ? {}
      : { transient: failure.transient }),
    ...(failure.detail === undefined ? {} : { detail: failure.detail })
  })
}

export const cursorHash = (cursor: string | null) =>
  createHash("sha256")
    .update(cursor ?? "")
    .digest("hex")
export const scanPageActivityName = (input: {
  kind: JiraScanKind
  scanRevision: number
  parentId: string | null
  pageOrdinal: number
  cursorHash: string
  operationTry: number
}) =>
  [
    "v1/scan",
    input.kind,
    input.scanRevision,
    ...(input.parentId === null ? [] : [encodeURIComponent(input.parentId)]),
    input.pageOrdinal,
    input.cursorHash,
    input.operationTry
  ].join("/")
export type ScanPageDependencies = Readonly<{
  client: Client.JiraClient["Service"]
  artifacts: MigrationArtifacts.JiraMigrationArtifacts["Service"]
  progress: (
    fence: MigrationProjection.AttemptFence,
    page: {
      kind: JiraScanKind
      parentId: string | null
      pageOrdinal: number
      count: number
    }
  ) => Effect.Effect<boolean, JiraError>
  finding: (
    fence: MigrationProjection.AttemptFence,
    finding: JiraMigrationFinding
  ) => Effect.Effect<boolean, JiraError>
  heartbeat: (
    fence: MigrationProjection.AttemptFence
  ) => Effect.Effect<boolean, JiraError>
  gate: Semaphore.Semaphore
  automaticRetryBudget: number
}>
const singleSnapshotPage = <A>(
  effect: Effect.Effect<{ raw: Schema.Json; value: A }, Client.JiraCallError>
) =>
  effect.pipe(
    Effect.map(({ raw, value }) => ({
      raw,
      values: [value],
      nextCursor: null
    }))
  )
const collectionSnapshotPage = <A>(
  effect: Effect.Effect<
    { raw: Schema.Json; value: ReadonlyArray<A> },
    Client.JiraCallError
  >
) =>
  effect.pipe(
    Effect.map(({ raw, value }) => ({ raw, values: value, nextCursor: null }))
  )

const pageResponse = Effect.fn("Jira.scanPageResponse")(function* (
  input: JiraScanPageInput,
  client: Client.JiraClient["Service"]
): Effect.fn.Return<
  {
    raw: Schema.Json
    values: ReadonlyArray<Schema.Json>
    nextCursor: string | null
  },
  Client.JiraCallError
> {
  const { userId, cloudId, projectId, parentId, kind, cursor } = input
  const base = { userId, cloudId }
  const offset = cursor === null ? 0 : Number(cursor)
  const issue = { ...base, issueIdOrKey: parentId ?? "", startAt: offset }
  const project = { ...base, projectIdOrKey: projectId, startAt: offset }
  switch (kind) {
    case "identity-options":
    case "attachments":
      return yield* new JiraError({ reason: "invalid_response" })
    case "account":
      return yield* singleSnapshotPage(
        client.snapshots.currentUser(userId, cloudId)
      )
    case "project":
      return yield* singleSnapshotPage(
        client.snapshots.project(userId, cloudId, projectId)
      )
    case "fields":
      return yield* collectionSnapshotPage(
        client.snapshots.fields(userId, cloudId)
      )
    case "statuses":
      return yield* collectionSnapshotPage(
        client.snapshots.projectStatuses(userId, cloudId, projectId)
      )
    case "priorities":
      return yield* collectionSnapshotPage(
        client.snapshots.priorities(userId, cloudId)
      )
    case "boardConfiguration":
      return yield* singleSnapshotPage(
        client.snapshots.boardConfiguration(userId, cloudId, Number(parentId))
      )
    case "watchers":
      return yield* singleSnapshotPage(
        client.snapshots.watchers(userId, cloudId, parentId ?? "")
      )
    case "votes":
      return yield* singleSnapshotPage(
        client.snapshots.votes(userId, cloudId, parentId ?? "")
      )
    case "issues": {
      const page = yield* client.searchIssuesPage({
        ...base,
        jql: `project = "${projectId.replaceAll('"', '\\"')}" ORDER BY id ASC`,
        fields: ["*all"],
        nextPageToken: cursor
      })
      return {
        raw: page.raw,
        values: page.values,
        nextCursor: page.nextPageToken
      }
    }
    case "sprintIssues": {
      const [boardId, sprintId] = (parentId ?? "").split(":").map(Number)
      const page = yield* client.sprintIssuesPage({
        ...base,
        boardId,
        sprintId,
        fields: ["id", "key"],
        nextPageToken: cursor
      })
      return {
        raw: page.raw,
        values: page.values,
        nextCursor: page.nextPageToken
      }
    }
  }
  const fetch: Effect.Effect<
    JiraOffsetPage<Schema.Json>,
    Client.JiraCallError
  > = Match.value(kind).pipe(
    Match.when("comments", () => client.commentsPage(issue)),
    Match.when("changelogs", () => client.changelogsPage(issue)),
    Match.when("worklogs", () => client.worklogsPage(issue)),
    Match.when("components", () => client.componentsPage(project)),
    Match.when("versions", () => client.versionsPage(project)),
    Match.when("boards", () => client.boardsPage(project)),
    Match.orElse(() =>
      client.sprintsPage({
        ...base,
        boardId: Number(parentId),
        startAt: offset
      })
    )
  )
  const page = yield* fetch
  const next = page.startAt + page.maxResults
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    page.startAt !== offset ||
    !Number.isSafeInteger(next) ||
    next <= offset
  )
    return yield* new JiraError({ reason: "invalid_response" })
  return {
    raw: page.raw,
    values: page.values,
    nextCursor:
      page.isLast || (page.total !== null && next >= page.total)
        ? null
        : String(next)
  }
})
const UNREADABLE_JIRA_ERROR_REASONS = new Set<string>([
  "invalid_response",
  "decode_failed",
  "invalid_json"
])

export const defineScanPageActivity = (
  input: JiraScanPageInput,
  dependencies: ScanPageDependencies
) =>
  Activity.make({
    name: scanPageActivityName({
      ...input,
      cursorHash: cursorHash(input.cursor)
    }),
    success: JiraScanPageResult,
    error: JiraScanPageError,
    execute: Effect.gen(function* () {
      const unavailablePage = (
        reason:
          | "permission_denied"
          | "unsupported_or_missing"
          | "invalid_response"
      ) =>
        Effect.succeed({
          raw: {
            kind: input.kind,
            parentId: input.parentId,
            unavailable: reason
          },
          values: [],
          nextCursor: null,
          warnings: [reason]
        })
      const fetched: Effect.Effect<
        {
          raw: Schema.Json
          values: ReadonlyArray<Schema.Json>
          nextCursor: string | null
        },
        | Client.JiraCallError
        | JiraScanFailure
        | import("./MigrationArtifacts").JiraMigrationArtifactError
      > = pageResponse(input, dependencies.client)
      const page = yield* fetched.pipe(
        Effect.map((page) => ({ ...page, warnings: [] as string[] })),
        Effect.catchTags({
          JiraAccessDenied: (error) =>
            OPTIONAL_SCAN_KINDS.has(input.kind)
              ? unavailablePage("permission_denied")
              : Effect.fail(error),
          JiraResourceNotFound: (error) =>
            OPTIONAL_SCAN_KINDS.has(input.kind)
              ? unavailablePage("unsupported_or_missing")
              : Effect.fail(error),
          JiraError: (error) =>
            SKIPPABLE_SCAN_KINDS.has(input.kind) &&
            UNREADABLE_JIRA_ERROR_REASONS.has(error.reason)
              ? unavailablePage("invalid_response")
              : Effect.fail(error)
        })
      )
      const coordinates = {
        migrationId: input.migrationId,
        scanRevision: input.scanRevision,
        kind: input.kind,
        identity: `${input.parentId === null ? "" : `${encodeURIComponent(input.parentId)}-`}${input.pageOrdinal}-${cursorHash(input.cursor)}`
      }
      const raw = yield* dependencies.artifacts.writeJson(
        input.orgSlug,
        { ...coordinates, area: "raw" },
        page.raw
      )
      const normalized = yield* dependencies.artifacts.writeJson(
        input.orgSlug,
        { ...coordinates, area: "normalized" },
        normalizeScanPageValues(page.values)
      )
      if (page.warnings.includes("invalid_response"))
        yield* dependencies.finding(
          input,
          jiraFinding(
            "source-collection-unreadable",
            `${input.kind} of Jira issue ${input.parentId ?? ""}`,
            `Jira returned ${input.kind} for this issue that could not be read, so they were skipped and are not in ProjectProject.`,
            input.parentId
          )
        )
      const accepted = yield* dependencies.progress(input, {
        kind: input.kind,
        parentId: input.parentId,
        pageOrdinal: input.pageOrdinal,
        count: page.values.length
      })
      if (!accepted) return yield* scanFailure("jira_migration_superseded")
      return {
        raw,
        normalized,
        count: page.values.length,
        nextCursor: page.nextCursor,
        warnings: page.warnings
      }
    }).pipe(
      Effect.mapError((error) =>
        Match.value(error).pipe(
          Match.tag(
            "JiraRateLimited",
            "JiraTransientFailure",
            "JiraScanFailure",
            (error) => error
          ),
          Match.orElse((error) => scanError(error))
        )
      )
    )
  })

export const JiraScanSnapshotResult = Schema.Struct({
  manifest: MigrationArtifacts.JiraArtifactRef,
  requirements: MigrationArtifacts.JiraArtifactRef,
  summary: MigrationArtifacts.JiraArtifactRef
})
export type JiraScanSnapshotResult = typeof JiraScanSnapshotResult.Type
export type ScanSnapshotDependencies = Readonly<
  ScanPageDependencies & {
    identityOptions: Effect.Effect<
      ReadonlyArray<JiraMigrationUserOption>,
      JiraError
    >
    configured: (
      fence: MigrationProjection.AttemptFence,
      result: {
        manifest: MigrationArtifacts.JiraArtifactRef
        requirements: JiraMigrationRequirements
        summary: JiraMigrationScanSummary
      }
    ) => Effect.Effect<boolean, JiraError>
    recordFailure: (
      fence: MigrationProjection.AttemptFence,
      operationKey: string,
      failure: JiraScanFailure
    ) => Effect.Effect<number | null, JiraError>
    resume: (
      fence: MigrationProjection.AttemptFence,
      failureSequence: number
    ) => Effect.Effect<MigrationProjection.JiraScanResumeResult, JiraError>
    beginScanDetails: (
      fence: MigrationProjection.AttemptFence,
      total: number
    ) => Effect.Effect<boolean, JiraError>
    beginScanFinalize: (
      fence: MigrationProjection.AttemptFence
    ) => Effect.Effect<boolean, JiraError>
    writeJsonBatch: (
      orgSlug: string,
      items: ReadonlyArray<
        Readonly<{
          coordinates: MigrationArtifacts.JiraArtifactCoordinates
          value: Schema.Json
        }>
      >
    ) => Effect.Effect<
      ReadonlyArray<MigrationArtifacts.JiraArtifactRef>,
      MigrationArtifacts.JiraMigrationArtifactError
    >
  }
>
export const defineIdentityOptionsActivity = (
  context: JiraScanContext,
  dependencies: ScanSnapshotDependencies,
  operationTry: number
) =>
  Activity.make({
    name: scanPageActivityName({
      kind: "identity-options",
      scanRevision: context.scanRevision,
      parentId: null,
      pageOrdinal: 0,
      cursorHash: cursorHash(null),
      operationTry
    }),
    success: MigrationArtifacts.JiraArtifactRef,
    error: JiraScanPageError,
    execute: Effect.gen(function* () {
      const options = yield* dependencies.identityOptions
      return yield* dependencies.artifacts.writeJson(
        context.orgSlug,
        {
          migrationId: context.migrationId,
          scanRevision: context.scanRevision,
          area: "normalized",
          kind: "identity-options",
          identity: "snapshot"
        },
        options.toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      )
    }).pipe(Effect.mapError(scanError))
  })
export const defineBuildManifestActivity = (
  context: JiraScanContext,
  references: ReadonlyArray<ScanChunkReference>,
  identityOptionsArtifact: MigrationArtifacts.JiraArtifactRef,
  dependencies: ScanSnapshotDependencies,
  operationTry: number
) =>
  Activity.make({
    name:
      operationTry === 0
        ? `v1/build-manifest/${context.scanRevision}`
        : `v1/build-manifest/${context.scanRevision}/${operationTry}`,
    success: JiraScanSnapshotResult,
    error: JiraScanPageError,
    execute: withHeartbeat(
      Effect.gen(function* () {
        yield* dependencies.beginScanFinalize(context)
        const chunks = yield* Effect.forEach(
          references.toSorted((a, b) =>
            a.normalized.key < b.normalized.key
              ? -1
              : a.normalized.key > b.normalized.key
                ? 1
                : 0
          ),
          (ref) =>
            dependencies.artifacts
              .verify(context.orgSlug, ref.raw)
              .pipe(
                Effect.andThen(
                  dependencies.artifacts.readJson(
                    context.orgSlug,
                    ref.normalized,
                    decodeUnknownArray
                  )
                )
              )
              .pipe(Effect.map((values) => ({ ...ref, values }))),
          { concurrency: 16 }
        )
        const prepared = yield* prepareScanV2(
          context,
          chunks,
          yield* dependencies.artifacts.readJson(
            context.orgSlug,
            identityOptionsArtifact,
            decodeUnknownJiraMigrationUserOptionArray
          )
        )
        const documentWrites = prepared.documents.map((document) => ({
          coordinates: {
            migrationId: context.migrationId,
            scanRevision: context.scanRevision,
            area: "normalized",
            kind: document.kind,
            identity: encodeURIComponent(document.id)
          },
          value: document.value
        }))
        const documentRefs = yield* dependencies.writeJsonBatch(
          context.orgSlug,
          documentWrites
        )
        const refs = new Map<string, MigrationArtifacts.JiraArtifactRef>(
          prepared.documents.map((document, index) => [
            `${document.kind}:${document.id}`,
            documentRefs[index]!
          ])
        )
        const built = yield* buildScanManifestV2(prepared, refs)
        const manifestValue = built.manifest
        yield* Effect.forEach(built.repairs, (repair) =>
          dependencies.finding(context, repair)
        )
        const coordinates = {
          migrationId: context.migrationId,
          scanRevision: context.scanRevision,
          area: "manifest",
          identity: "snapshot"
        }
        const manifest = yield* dependencies.artifacts.writeJson(
          context.orgSlug,
          { ...coordinates, kind: "manifest-v2" },
          manifestValue
        )
        const requirements = yield* dependencies.artifacts.writeJson(
          context.orgSlug,
          { ...coordinates, kind: "requirements" },
          prepared.requirements
        )
        const summaryValue = {
          ...prepared.legacy.summary,
          visibilityWarnings: manifestValue.coverage
            .filter((item) => isCoverageLimited(item.visibility))
            .map((item) => ({
              category: item.category,
              label: item.category,
              detail: item.reason
            })),
          counts: {
            ...prepared.legacy.summary.counts,
            identities: manifestValue.identities.length
          }
        }
        const summary = yield* dependencies.artifacts.writeJson(
          context.orgSlug,
          { ...coordinates, kind: "summary" },
          {
            ...summaryValue,
            scannedAt: DateTime.formatIso(summaryValue.scannedAt)
          }
        )
        if (
          !(yield* dependencies.configured(context, {
            manifest,
            requirements: prepared.requirements,
            summary: summaryValue
          }))
        )
          return yield* scanFailure("jira_migration_superseded")
        return { manifest, requirements, summary }
      }),
      dependencies.heartbeat(context)
    ).pipe(
      Effect.mapError((error) =>
        Match.value(error).pipe(
          Match.tag("JiraScanFailure", (error) => error),
          Match.orElse((error) => scanError(error))
        )
      )
    )
  })
