import type * as Exit from "effect/Exit"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { Activity } from "effect/unstable/workflow"
import type {
  JiraMigrationWorkflowFailure,
  JiraMigrationWorkflowFailureValue,
  JiraMigrationWorkflowPayloadValue
} from "./MigrationWorkflow"
import { createHash } from "node:crypto"
import { Schedule } from "effect"
import { JiraError } from "@projectproject/shared"
import type { JiraClientShape, JiraCallError } from "./Client"
import { JiraIssue, type JiraOffsetPage } from "./ClientSchemas"
import {
  JiraArtifactRef,
  type JiraMigrationArtifactsShape
} from "./MigrationArtifacts"
import type { AttemptFence, JiraScanResumeResult } from "./MigrationProjection"
import { JiraRateLimited, JiraTransientFailure } from "./Blocked"
import {
  JiraMigrationRequirements,
  JiraMigrationScanSummary,
  JiraMigrationUserOption
} from "@projectproject/shared"
import {
  prepareScanV2,
  buildScanManifestV2,
  normalizeScanPageValues,
  type ScanChunkReference
} from "./ScanV2"
import { DateTime } from "effect"
import { JiraAttachmentOutcome } from "./PublicationPlan"
import { canonicalJiraJson } from "./Manifest"

export const VerifiedJiraMaterialization = Schema.Struct({
  planSha256: Schema.String,
  documentCount: Schema.Int,
  attachmentCount: Schema.Int,
  unresolvedReferenceCount: Schema.Literal(0)
})
export type VerifiedJiraMaterialization =
  typeof VerifiedJiraMaterialization.Type

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
      planRef: JiraArtifactRef
      publicationRevision: string
      documentBatchCount: number
    }>,
    JiraMigrationWorkflowFailureValue,
    R
  >
  writeDocumentBatch: (
    planRef: JiraArtifactRef,
    ordinal: number
  ) => Effect.Effect<number, JiraMigrationWorkflowFailureValue, R>
  writeArchive: (
    planRef: JiraArtifactRef
  ) => Effect.Effect<number, JiraMigrationWorkflowFailureValue, R>
  writeReport: (
    planRef: JiraArtifactRef
  ) => Effect.Effect<number, JiraMigrationWorkflowFailureValue, R>
  verify: (
    planRef: JiraArtifactRef
  ) => Effect.Effect<
    VerifiedJiraMaterialization,
    JiraMigrationWorkflowFailureValue,
    R
  >
}>

export const materializeJiraPreparedPublication = <
  A extends Readonly<{ sourceAttachmentId: string }>,
  R
>(
  input: Readonly<{
    scanRevision: number
    configurationRevision: number
    attachments: ReadonlyArray<A>
  }>,
  dependencies: JiraMaterializationDependencies<A, R>
) =>
  Effect.gen(function* () {
    const projectId = yield* Activity.make({
      name: jiraCreateHiddenActivityName(
        input.scanRevision,
        input.configurationRevision,
        0
      ),
      success: Schema.String,
      error: dependencies.error,
      execute: dependencies.createHidden
    })
    const outcomes = yield* Effect.forEach(
      input.attachments.toSorted((a, b) =>
        a.sourceAttachmentId < b.sourceAttachmentId
          ? -1
          : a.sourceAttachmentId > b.sourceAttachmentId
            ? 1
            : 0
      ),
      (attachment) =>
        Activity.make({
          name: jiraCopyAttachmentActivityName(
            attachment.sourceAttachmentId,
            0
          ),
          success: JiraAttachmentOutcome,
          error: dependencies.error,
          execute: dependencies.copyAttachment(attachment)
        }),
      { concurrency: 4 }
    )
    const encodedOutcomes = yield* Schema.encodeEffect(
      Schema.Array(JiraAttachmentOutcome)
    )(outcomes).pipe(
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
    const finalized = yield* Activity.make({
      name: jiraFinalizePlanActivityName(
        input.scanRevision,
        input.configurationRevision,
        outcomeSetSha256,
        0
      ),
      success: Schema.Struct({
        planRef: JiraArtifactRef,
        publicationRevision: Schema.String,
        documentBatchCount: Schema.Int
      }),
      error: dependencies.error,
      execute: dependencies.finalizePlan(outcomes)
    })
    for (let ordinal = 0; ordinal < finalized.documentBatchCount; ordinal++)
      yield* Activity.make({
        name: jiraWriteDocumentsActivityName(
          finalized.publicationRevision,
          ordinal,
          0
        ),
        success: Schema.Int,
        error: dependencies.error,
        execute: dependencies.writeDocumentBatch(finalized.planRef, ordinal)
      })
    yield* Activity.make({
      name: jiraPublicationActivityName(
        "write-archive",
        finalized.publicationRevision,
        0
      ),
      success: Schema.Int,
      error: dependencies.error,
      execute: dependencies.writeArchive(finalized.planRef)
    })
    yield* Activity.make({
      name: jiraPublicationActivityName(
        "write-report",
        finalized.publicationRevision,
        0
      ),
      success: Schema.Int,
      error: dependencies.error,
      execute: dependencies.writeReport(finalized.planRef)
    })
    const verified = yield* Activity.make({
      name: jiraPublicationActivityName(
        "verify",
        finalized.publicationRevision,
        0
      ),
      success: VerifiedJiraMaterialization,
      error: dependencies.error,
      execute: dependencies.verify(finalized.planRef)
    })
    if (verified.planSha256 !== finalized.publicationRevision)
      return yield* Effect.fail(
        dependencies.error.make({
          reason: "jira_migration_plan_mismatch",
          retryable: false
        })
      )
    return { projectId, planRef: finalized.planRef, verified }
  })

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
    | import("effect/unstable/workflow/WorkflowEngine").WorkflowEngine
    | import("effect/unstable/workflow/WorkflowEngine").WorkflowInstance
  >
  materialize: (
    input: MigrationActivityInput
  ) => Effect.Effect<
    void,
    JiraMigrationWorkflowFailureValue,
    R | import("effect/unstable/workflow/WorkflowEngine").WorkflowInstance
  >
  start: (
    input: MigrationActivityInput
  ) => Effect.Effect<void, JiraMigrationWorkflowFailureValue, R>
  finalize: (
    input: Readonly<{
      executionId: string
      exit: Exit.Exit<unknown, unknown>
    }>
  ) => Effect.Effect<void, never, R>
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

export const JiraScanKind = Schema.Literals([
  "identity-options",
  "account",
  "project",
  "fields",
  "statuses",
  "priorities",
  "components",
  "versions",
  "boards",
  "boardConfiguration",
  "sprints",
  "sprintIssues",
  "issues",
  "comments",
  "changelogs",
  "worklogs",
  "watchers",
  "votes",
  "attachments"
])
export type JiraScanKind = typeof JiraScanKind.Type
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
  sourceArtifact: Schema.optional(JiraArtifactRef),
  kind: JiraScanKind,
  parentId: Schema.NullOr(Schema.String),
  cursor: Schema.NullOr(Schema.String),
  pageOrdinal: Schema.Int,
  operationTry: Schema.Int
})
export type JiraScanPageInput = typeof JiraScanPageInput.Type
export const JiraScanPageResult = Schema.Struct({
  raw: JiraArtifactRef,
  normalized: JiraArtifactRef,
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
    reconnect: Schema.Boolean
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
export const scanError = (error: {
  readonly _tag: string
}): JiraScanFailure => {
  switch (error._tag) {
    case "JiraNotConnected":
    case "JiraReconnectRequired":
      return scanFailure("jira_reconnect_required", true, true)
    case "JiraArtifactError":
    case "S3Unavailable":
    case "StorageNotConnected":
    case "StorageConfigMissing":
      return scanFailure("jira_migration_storage_failed", true)
    case "MarkdownError":
      return scanFailure("jira_migration_markdown_failed", true)
    default:
      return scanFailure("jira_migration_invalid_response")
  }
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
export interface ScanPageDependencies {
  readonly client: JiraClientShape
  readonly artifacts: JiraMigrationArtifactsShape
  readonly progress: (
    fence: AttemptFence,
    page: {
      readonly kind: JiraScanKind
      readonly parentId: string | null
      readonly pageOrdinal: number
      readonly count: number
    }
  ) => Effect.Effect<boolean, JiraError>
}
const singleSnapshotPage = <A>(
  effect: Effect.Effect<{ raw: unknown; value: A }, JiraCallError>
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
    { raw: unknown; value: ReadonlyArray<A> },
    JiraCallError
  >
) =>
  effect.pipe(
    Effect.map(({ raw, value }) => ({ raw, values: value, nextCursor: null }))
  )

const pageResponse = Effect.fn("Jira.scanPageResponse")(function* (
  input: JiraScanPageInput,
  client: JiraClientShape
): Effect.fn.Return<
  { raw: unknown; values: ReadonlyArray<unknown>; nextCursor: string | null },
  JiraCallError
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
  const fetch: Effect.Effect<JiraOffsetPage<unknown>, JiraCallError> = kind ===
  "comments"
    ? client.commentsPage(issue)
    : kind === "changelogs"
      ? client.changelogsPage(issue)
      : kind === "worklogs"
        ? client.worklogsPage(issue)
        : kind === "components"
          ? client.componentsPage(project)
          : kind === "versions"
            ? client.versionsPage(project)
            : kind === "boards"
              ? client.boardsPage(project)
              : client.sprintsPage({
                  ...base,
                  boardId: Number(parentId),
                  startAt: offset
                })
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
const OPTIONAL_SCAN_KINDS = new Set<JiraScanKind>([
  "watchers",
  "votes",
  "boards",
  "boardConfiguration",
  "sprints",
  "sprintIssues",
  "comments",
  "changelogs",
  "worklogs"
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
      const fetched: Effect.Effect<
        {
          raw: unknown
          values: ReadonlyArray<unknown>
          nextCursor: string | null
        },
        | JiraCallError
        | JiraScanFailure
        | import("./MigrationArtifacts").JiraMigrationArtifactError
      > =
        input.kind === "attachments"
          ? Effect.gen(function* () {
              if (input.sourceArtifact === undefined)
                return yield* scanFailure("jira_migration_missing_issue_chunk")
              const issues = yield* dependencies.artifacts.readJson(
                input.orgSlug,
                input.sourceArtifact,
                Schema.Array(JiraIssue)
              )
              const issue = issues.find((issue) => issue.id === input.parentId)
              if (!issue)
                return yield* scanFailure("jira_migration_missing_issue")
              const values = yield* Schema.decodeUnknownEffect(
                Schema.Array(Schema.Unknown)
              )(issue.fields.attachment ?? []).pipe(Effect.mapError(scanError))
              return { raw: values, values, nextCursor: null }
            })
          : pageResponse(input, dependencies.client)
      const page = yield* fetched.pipe(
        Effect.map((page) => ({ ...page, warnings: [] as string[] })),
        Effect.catchIf(
          (error) =>
            OPTIONAL_SCAN_KINDS.has(input.kind) &&
            (error._tag === "JiraAccessDenied" ||
              error._tag === "JiraResourceNotFound"),
          (error) => {
            const reason =
              error._tag === "JiraAccessDenied"
                ? "permission_denied"
                : "unsupported_or_missing"
            return Effect.succeed({
              raw: {
                kind: input.kind,
                parentId: input.parentId,
                unavailable: reason
              },
              values: [],
              nextCursor: null,
              warnings: [reason]
            })
          }
        ),
        Effect.retry(
          Schedule.max([
            Schedule.exponential("250 millis").pipe(Schedule.jittered),
            Schedule.recurs(3)
          ]).pipe(
            Schedule.setInputType<
              | JiraCallError
              | JiraScanFailure
              | import("./MigrationArtifacts").JiraMigrationArtifactError
            >(),
            Schedule.while(
              ({ input }) =>
                input._tag === "JiraTransientFailure" &&
                input.reason !== "invalid_retry_after"
            )
          )
        )
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
        error._tag === "JiraRateLimited" ||
        error._tag === "JiraTransientFailure" ||
        error._tag === "JiraScanFailure"
          ? error
          : scanError(error)
      )
    )
  })

export const JiraScanSnapshotResult = Schema.Struct({
  manifest: JiraArtifactRef,
  requirements: JiraArtifactRef,
  summary: JiraArtifactRef
})
export type JiraScanSnapshotResult = typeof JiraScanSnapshotResult.Type
export interface ScanSnapshotDependencies extends ScanPageDependencies {
  readonly identityOptions: Effect.Effect<
    ReadonlyArray<JiraMigrationUserOption>,
    JiraError
  >
  readonly configured: (
    fence: AttemptFence,
    result: {
      readonly manifest: JiraArtifactRef
      readonly requirements: JiraMigrationRequirements
      readonly summary: JiraMigrationScanSummary
    }
  ) => Effect.Effect<boolean, JiraError>
  readonly recordFailure: (
    fence: AttemptFence,
    operationKey: string,
    failure: JiraScanFailure
  ) => Effect.Effect<number | null, JiraError>
  readonly resume: (
    fence: AttemptFence,
    failureSequence: number
  ) => Effect.Effect<JiraScanResumeResult, JiraError>
}
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
    success: JiraArtifactRef,
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
  identityOptionsArtifact: JiraArtifactRef,
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
    execute: Effect.gen(function* () {
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
                  Schema.Array(Schema.Unknown)
                )
              )
            )
            .pipe(Effect.map((values) => ({ ...ref, values })))
      )
      const prepared = yield* prepareScanV2(
        context,
        chunks,
        yield* dependencies.artifacts.readJson(
          context.orgSlug,
          identityOptionsArtifact,
          Schema.Array(JiraMigrationUserOption)
        )
      )
      const refs = new Map<string, JiraArtifactRef>()
      for (const document of prepared.documents) {
        const ref = yield* dependencies.artifacts.writeJson(
          context.orgSlug,
          {
            migrationId: context.migrationId,
            scanRevision: context.scanRevision,
            area: "normalized",
            kind: document.kind,
            identity: encodeURIComponent(document.id)
          },
          document.value
        )
        refs.set(`${document.kind}:${document.id}`, ref)
      }
      const manifestValue = yield* buildScanManifestV2(prepared, refs)
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
          .filter((item) => item.visibility !== "complete")
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
    }).pipe(
      Effect.mapError((error) =>
        error._tag === "JiraScanFailure" ? error : scanError(error)
      )
    )
  })
