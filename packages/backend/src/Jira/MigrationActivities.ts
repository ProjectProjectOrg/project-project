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

export interface MigrationActivities<R = never> {
  readonly scan: (input: {
    readonly payload: JiraMigrationWorkflowPayloadValue
    readonly executionId: string
  }) => Effect.Effect<
    void,
    JiraMigrationWorkflowFailureValue,
    | R
    | import("effect/unstable/workflow/WorkflowEngine").WorkflowEngine
    | import("effect/unstable/workflow/WorkflowEngine").WorkflowInstance
  >

  readonly start: (input: {
    readonly payload: JiraMigrationWorkflowPayloadValue
    readonly executionId: string
  }) => Effect.Effect<void, JiraMigrationWorkflowFailureValue, R>
  readonly finalize: (input: {
    readonly executionId: string
    readonly exit: Exit.Exit<unknown, unknown>
  }) => Effect.Effect<void, never, R>
}

export const activityName = (parts: ReadonlyArray<string | number>) =>
  `v1/${parts.map(String).join("/")}`

export const makeStartMigrationActivity = <R>(
  execute: Effect.Effect<void, JiraMigrationWorkflowFailureValue, R>,
  error: typeof JiraMigrationWorkflowFailure
) =>
  Activity.make({
    name: activityName(["start"]),
    success: Schema.Void,
    error,
    execute
  })

export const makeFinalizeMigrationActivity = <R>(
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

export const makeScanPageActivity = (
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
export const makeIdentityOptionsActivity = (
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
export const makeBuildManifestActivity = (
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
