import type { JiraMigrationFinding, JiraMigrationUserOption } from "@pp/shared"
import {
  DateTime,
  Effect,
  Option,
  Predicate,
  Result,
  Schema,
  SchemaIssue
} from "effect"
import * as Match from "effect/Match"

import * as C from "./ClientSchemas"
import { countBy, groupBy } from "./collections"
import { jiraFinding } from "./Findings"
import {
  JiraMigrationManifestV2,
  normalizeJiraMigrationManifestV2
} from "./Manifest"
import {
  JiraScanFailure,
  scanFailure,
  type JiraScanContext
} from "./MigrationActivities"
import type * as MigrationArtifacts from "./MigrationArtifacts"
import { buildJiraScanArtifacts } from "./Scan"
import { ISSUE_DEPENDENT_SCAN_KINDS, type JiraScanKind } from "./scanKinds"

const decodeUnknownJiraProjectArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraProject)
)

const decodeUnknownJiraUserArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraUser)
)

const decodeUnknownJiraIssueArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraIssue)
)

const decodeUnknownJiraFieldArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraField)
)

const decodeUnknownJiraIssueTypeStatusesArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraIssueTypeStatuses)
)

const decodeUnknownJiraPriorityArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraPriority)
)

const decodeUnknownJiraComponentArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraComponent)
)

const decodeUnknownJiraVersionArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraVersion)
)

const decodeUnknownJiraSprintArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraSprint)
)

const decodeUnknownJiraCommentArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraComment)
)

const decodeUnknownJiraChangelogArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraChangelog)
)

const decodeUnknownJiraWorklogArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraWorklog)
)

const decodeUnknownJiraWatchersArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraWatchers)
)

const decodeUnknownJiraVotesArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraVotes)
)

const decodeUnknownNonEmptyStringOption = Schema.decodeUnknownOption(
  Schema.NonEmptyString
)

const decodeUnknownJiraIssueReferenceArray = Schema.decodeUnknownEffect(
  Schema.Array(C.JiraIssueReference)
)

const decodeUnknownJiraMigrationManifestV2 = Schema.decodeUnknownEffect(
  JiraMigrationManifestV2
)

export type ScanChunkReference = Readonly<{
  kind: JiraScanKind
  parentId: string | null
  raw: MigrationArtifacts.JiraArtifactRef
  normalized: MigrationArtifacts.JiraArtifactRef
  warnings: ReadonlyArray<string>
}>
export type ScanChunk = Readonly<
  ScanChunkReference & {
    values: ReadonlyArray<Schema.Json>
  }
>
const customFieldText = (value: Schema.Json | undefined) =>
  decodeUnknownNonEmptyStringOption(value).pipe(Option.getOrNull)
const unique = <A>(values: ReadonlyArray<A>, key: (value: A) => string) => [
  ...new Map(values.map((value) => [key(value), value])).values()
]
const IssueDetails = Schema.Struct({
  duedate: Schema.optionalKey(Schema.NullOr(Schema.String)),
  resolution: Schema.optionalKey(
    Schema.NullOr(Schema.Struct({ name: Schema.optionalKey(Schema.String) }))
  ),
  resolutiondate: Schema.optionalKey(Schema.NullOr(Schema.String)),
  timeoriginalestimate: Schema.optionalKey(Schema.NullOr(Schema.Finite))
})
const decodeIssueDetails = Schema.decodeUnknownOption(IssueDetails)
const issueDetails = (fields: Schema.Json) => {
  const details = Option.getOrNull(decodeIssueDetails(fields))
  const estimate = details?.timeoriginalestimate ?? null
  return {
    dueDate: details?.duedate || null,
    resolution: details?.resolution?.name || null,
    resolvedAt: details?.resolutiondate || null,
    originalEstimateSeconds:
      estimate !== null && Number.isInteger(estimate) && estimate > 0
        ? estimate
        : null
  }
}
const ScanValueIdentity = Schema.Struct({
  id: Schema.optionalKey(Schema.Union([Schema.String, Schema.Finite])),
  accountId: Schema.optionalKey(Schema.String)
})
const decodeScanValueIdentity = Schema.decodeUnknownOption(ScanValueIdentity)
const pageValueKey = (value: Schema.Json): string =>
  decodeScanValueIdentity(value).pipe(
    Option.map((identity) => String(identity.id ?? identity.accountId ?? "")),
    Option.getOrElse(() => "")
  )
export const normalizeScanPageValues = (values: ReadonlyArray<Schema.Json>) =>
  values.toSorted((left, right) => {
    const a = pageValueKey(left)
    const b = pageValueKey(right)
    return a < b ? -1 : a > b ? 1 : 0
  })

const MetadataString = Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString))
const RecoveredMetadataString = Schema.optionalKey(
  Schema.NullOr(Schema.NonEmptyString).pipe(
    Schema.catchDecoding(() => Effect.succeed(Option.some(null)))
  )
)
const StrictFieldMetadata = Schema.NullOr(
  Schema.Struct({ type: MetadataString, custom: MetadataString })
)
const FieldMetadata = Schema.NullOr(
  Schema.Struct({
    type: RecoveredMetadataString,
    custom: RecoveredMetadataString
  })
).pipe(Schema.catchDecoding(() => Effect.succeed(Option.some(null))))
const decodeFieldMetadata = Schema.decodeUnknownSync(FieldMetadata)
const checkFieldMetadata = Schema.decodeUnknownResult(StrictFieldMetadata, {
  errors: "all"
})
const formatMetadataIssue = SchemaIssue.makeFormatterStandardSchemaV1()

const decodeEmbeddedComments = Schema.decodeUnknownOption(
  Schema.Struct({ comments: Schema.Array(C.JiraComment), total: Schema.Finite })
)
const decodeEmbeddedWorklogs = Schema.decodeUnknownOption(
  Schema.Struct({ worklogs: Schema.Array(C.JiraWorklog), total: Schema.Finite })
)
const decodeWatchCount = Schema.decodeUnknownOption(
  Schema.Struct({ watchCount: Schema.Finite })
)
const decodeVoteCount = Schema.decodeUnknownOption(
  Schema.Struct({ votes: Schema.Finite })
)

const embeddedComments = (issue: C.JiraIssue) =>
  decodeEmbeddedComments(issue.fields["comment"]).pipe(
    Option.filter(({ comments, total }) => total <= comments.length),
    Option.map(({ comments }) => comments)
  )

const embeddedWorklogs = (issue: C.JiraIssue) =>
  decodeEmbeddedWorklogs(issue.fields["worklog"]).pipe(
    Option.filter(({ worklogs, total }) => total <= worklogs.length),
    Option.map(({ worklogs }) => worklogs)
  )

export const issueDetailKinds = (
  issue: C.JiraIssue
): ReadonlyArray<JiraScanKind> => [
  ...(Option.isSome(embeddedComments(issue)) ? [] : ["comments" as const]),
  "changelogs",
  ...(Option.isSome(embeddedWorklogs(issue)) ? [] : ["worklogs" as const]),
  ...(Option.exists(
    decodeWatchCount(issue.fields["watches"]),
    ({ watchCount }) => watchCount === 0
  )
    ? []
    : ["watchers" as const]),
  ...(Option.exists(
    decodeVoteCount(issue.fields["votes"]),
    ({ votes }) => votes === 0
  )
    ? []
    : ["votes" as const])
]

export const prepareScanV2 = Effect.fn("prepareScanV2")(function* (
  context: JiraScanContext,
  chunks: ReadonlyArray<ScanChunk>,
  identityOptions: ReadonlyArray<JiraMigrationUserOption>
) {
  const read = <A>(
    kind: JiraScanKind,
    decode: ReturnType<
      typeof Schema.decodeUnknownEffect<Schema.Decoder<ReadonlyArray<A>>>
    >
  ) =>
    decode(
      chunks
        .filter((chunk) => chunk.kind === kind)
        .flatMap((chunk) => chunk.values)
    )
  const project = (yield* read("project", decodeUnknownJiraProjectArray))[0]
  const account = (yield* read("account", decodeUnknownJiraUserArray))[0]
  if (!project || !account)
    return yield* scanFailure("jira_migration_missing_metadata")
  const issues = yield* read("issues", decodeUnknownJiraIssueArray)
  const fields = (yield* read("fields", decodeUnknownJiraFieldArray)).map(
    (field) => {
      const checked = checkFieldMetadata(field.schema ?? null)
      return Object.assign({}, field, {
        schema: decodeFieldMetadata(field.schema ?? null),
        normalizationWarnings: Result.isFailure(checked)
          ? formatMetadataIssue(checked.failure.issue).issues.map(
              (issue) =>
                `Normalized malformed metadata ${JSON.stringify(issue.path ?? [])} on ${field.id}`
            )
          : []
      })
    }
  )
  const statuses = yield* read(
    "statuses",
    decodeUnknownJiraIssueTypeStatusesArray
  )
  const priorities = yield* read("priorities", decodeUnknownJiraPriorityArray)
  const components = yield* read("components", decodeUnknownJiraComponentArray)
  const versions = yield* read("versions", decodeUnknownJiraVersionArray)
  const sprints = unique(
    yield* read("sprints", decodeUnknownJiraSprintArray),
    (sprint) => String(sprint.id)
  )
  const nested = <A>(
    kind: JiraScanKind,
    decode: ReturnType<
      typeof Schema.decodeUnknownEffect<Schema.Decoder<ReadonlyArray<A>>>
    >
  ) =>
    Effect.forEach(
      chunks.filter((chunk) => chunk.kind === kind),
      (chunk) =>
        decode(chunk.values).pipe(
          Effect.map((values) =>
            values.map((value) => ({ issueId: chunk.parentId!, value }))
          )
        )
    ).pipe(Effect.map((values) => values.flat()))
  const embedded = <A>(
    kind: JiraScanKind,
    select: (issue: C.JiraIssue) => Option.Option<ReadonlyArray<A>>
  ) => {
    const fetched = new Set(
      chunks
        .filter((chunk) => chunk.kind === kind)
        .map((chunk) => chunk.parentId)
    )
    return issues.flatMap((issue) =>
      fetched.has(issue.id)
        ? []
        : Option.getOrElse(select(issue), (): ReadonlyArray<A> => []).map(
            (value) => ({ issueId: issue.id, value })
          )
    )
  }
  const comments = [
    ...(yield* nested("comments", decodeUnknownJiraCommentArray)),
    ...embedded("comments", embeddedComments)
  ]
  const changelogs = yield* nested(
    "changelogs",
    decodeUnknownJiraChangelogArray
  )
  const worklogs = [
    ...(yield* nested("worklogs", decodeUnknownJiraWorklogArray)),
    ...embedded("worklogs", embeddedWorklogs)
  ]
  const watchers = yield* nested("watchers", decodeUnknownJiraWatchersArray)
  const votes = yield* nested("votes", decodeUnknownJiraVotesArray)
  const byIssue = <A>(
    values: ReadonlyArray<Readonly<{ issueId: string; value: A }>>
  ) => {
    const grouped = groupBy(
      values,
      (item) => item.issueId,
      (item) => item.value
    )
    return Object.fromEntries(
      issues.map((issue) => [issue.id, grouped.get(issue.id) ?? []])
    )
  }
  const sprintMembership = yield* Effect.forEach(sprints, (sprint) =>
    Effect.gen(function* () {
      const memberships = chunks
        .filter(
          (chunk) =>
            chunk.kind === "sprintIssues" &&
            chunk.parentId?.endsWith(`:${sprint.id}`)
        )
        .flatMap((chunk) => chunk.values)
      const refs = yield* decodeUnknownJiraIssueReferenceArray(memberships)
      return {
        sprint,
        issueIds: unique(refs, (value) => value.id).map((value) => value.id)
      }
    })
  )
  const extraUsers = [
    account,
    ...issues.flatMap((issue) => [issue.fields.reporter, issue.fields.creator]),
    ...changelogs.map((item) => item.value.author),
    ...watchers.flatMap((item) => item.value.watchers ?? []),
    ...votes.flatMap((item) => item.value.voters ?? [])
  ].filter((value): value is C.JiraUser => value != null)
  const legacy = yield* buildJiraScanArtifacts({
    ...context,
    project,
    statuses,
    priorities,
    components,
    versions,
    issues,
    commentsByIssue: byIssue(comments),
    worklogsByIssue: byIssue(worklogs),
    sprints: sprintMembership,
    identityOptions,
    scannedAt: DateTime.makeUnsafe(context.scannedAt)
  })
  const identities = unique(
    [
      ...legacy.manifest.identities,
      ...extraUsers.map((user) => ({
        accountId: user.accountId,
        displayName: user.displayName,
        emailAddress: user.emailAddress ?? null,
        active: user.active ?? null,
        accountType: user.accountType ?? null
      }))
    ],
    (user) => user.accountId
  )
  const tally = (accountIds: ReadonlyArray<string | null | undefined>) =>
    countBy(accountIds.filter(Predicate.isString))
  const assigned = tally(
    legacy.manifest.issues.map((issue) => issue.assigneeAccountId)
  )
  const reported = tally(
    issues.map((issue) => issue.fields.reporter?.accountId)
  )
  const commented = tally(
    legacy.manifest.comments.map((comment) => comment.authorAccountId)
  )
  const requirements = {
    ...legacy.requirements,
    identities: identities.map((identity) => ({
      assignedIssueCount: assigned.get(identity.accountId) ?? 0,
      reportedIssueCount: reported.get(identity.accountId) ?? 0,
      commentCount: commented.get(identity.accountId) ?? 0,
      jiraAccountId: identity.accountId,
      displayName: identity.displayName,
      email: identity.emailAddress,
      suggestedProjectProjectUserId:
        identityOptions.find(
          (option) =>
            identity.emailAddress != null &&
            option.email.toLowerCase() === identity.emailAddress.toLowerCase()
        )?.id ?? null
    }))
  }
  const documents = [
    ...legacy.manifest.issues.flatMap((issue) =>
      issue.description === null
        ? []
        : [{ kind: "description", id: issue.id, value: issue.description }]
    ),
    ...legacy.manifest.comments.map((comment) => ({
      kind: "comment",
      id: comment.id,
      value: comment.body
    })),
    ...worklogs.flatMap(({ value }) =>
      value.comment == null
        ? []
        : [{ kind: "worklog", id: value.id, value: value.comment }]
    ),
    ...legacy.manifest.attachments.map((attachment) => ({
      kind: "attachment",
      id: attachment.id,
      value: attachment.raw
    })),
    ...fields
      .filter((field) => field.custom === true)
      .map((field) => ({
        kind: "custom-field",
        id: field.id,
        value: issues
          .filter((issue) => issue.fields[field.id] !== undefined)
          .map((issue) => ({
            issueId: issue.id,
            value: issue.fields[field.id]
          }))
      }))
  ]
  return {
    context,
    chunks,
    project,
    account,
    issues,
    fields,
    statuses,
    versions,
    sprints: sprintMembership,
    comments,
    changelogs,
    worklogs,
    watchers,
    votes,
    legacy,
    identities,
    requirements,
    documents
  }
})
export type PreparedScanV2 = Effect.Success<ReturnType<typeof prepareScanV2>>
export const buildScanManifestV2 = Effect.fn("buildScanManifestV2")(function* (
  data: PreparedScanV2,
  refs: ReadonlyMap<string, MigrationArtifacts.JiraArtifactRef>
) {
  const { context, legacy, issues, fields } = data
  const ref = (kind: string, id: string) => refs.get(`${kind}:${id}`)
  const sourceIssues = new Map(issues.map((issue) => [issue.id, issue]))
  const subtaskTypes = new Set(
    legacy.manifest.issueTypes
      .filter((type) => type.subtask)
      .map(({ id }) => id)
  )
  const keysById = new Map(
    legacy.manifest.issues.map((issue) => [issue.id, issue.key])
  )
  const manifest = yield* decodeUnknownJiraMigrationManifestV2({
    version: 2,
    migrationId: context.migrationId,
    scanRevision: context.scanRevision,
    source: {
      cloudId: context.cloudId,
      siteUrl: context.siteUrl,
      projectId: data.project.id,
      projectKey: data.project.key,
      projectName: data.project.name,
      scannedAt: context.scannedAt,
      visibleAccount: {
        accountId: data.account.accountId,
        displayName: data.account.displayName,
        caveat: "Only content visible to this Jira account was scanned."
      }
    },
    workflow: {
      executionId: context.workflowExecutionId,
      attempt: context.workflowAttempt
    },
    fieldDefinitions: fields.map((field) => ({
      id: field.id,
      key: field.key ?? field.id,
      name: field.name,
      type: field.schema?.type ?? "unknown"
    })),
    workflows: data.statuses.map((type) => ({
      id: type.id,
      name: type.name,
      statusIds: type.statuses.map((status) => status.id)
    })),
    identities: data.identities,
    statuses: legacy.manifest.statuses,
    issueTypes: legacy.manifest.issueTypes,
    priorities: legacy.manifest.priorities,
    components: legacy.manifest.components,
    issues: legacy.manifest.issues.map((issue) => {
      const source = sourceIssues.get(issue.id)
      return {
        ...issue,
        ...(source === undefined ? {} : issueDetails(source.fields)),
        descriptionArtifact: ref("description", issue.id) ?? null,
        reporterAccountId: source?.fields.reporter?.accountId ?? null,
        labelIds: issue.labels
      }
    }),
    comments: legacy.manifest.comments.map((comment) => ({
      ...comment,
      bodyArtifact: ref("comment", comment.id)
    })),
    changelogs: data.changelogs.map(({ issueId, value }) => ({
      id: value.id,
      issueId,
      authorAccountId: value.author?.accountId ?? null,
      createdAt: value.created,
      changes: value.items.map((item) => ({
        fieldId: item.fieldId || item.field || "unknown",
        from: item.from || null,
        to: item.to || null
      }))
    })),
    worklogs: data.worklogs.map(({ issueId, value }) => ({
      id: value.id,
      issueId,
      authorAccountId: value.author.accountId,
      seconds: value.timeSpentSeconds,
      startedAt: value.started,
      bodyArtifact: ref("worklog", value.id) ?? null,
      restricted: value.visibility !== undefined
    })),
    watchers: data.watchers.flatMap(({ issueId, value }) =>
      (value.watchers ?? []).map((user) => ({
        id: `${issueId}:${user.accountId}`,
        issueId,
        accountId: user.accountId
      }))
    ),
    votes: data.votes.flatMap(({ issueId, value }) =>
      (value.voters ?? []).map((user) => ({
        id: `${issueId}:${user.accountId}`,
        issueId,
        accountId: user.accountId
      }))
    ),
    attachments: legacy.manifest.attachments.map((attachment) => ({
      ...attachment,
      metadataArtifact: ref("attachment", attachment.id)
    })),
    parentsSubtasks: legacy.manifest.issues
      .filter(
        (issue) =>
          issue.parentIssueId !== null &&
          keysById.has(issue.parentIssueId) &&
          subtaskTypes.has(issue.issueTypeId)
      )
      .map((issue) => ({
        id: issue.id,
        parentIssueId: issue.parentIssueId,
        subtaskIssueId: issue.id
      })),
    epics: legacy.manifest.groups
      .filter((group) => group.kind === "epic")
      .map((group) => ({
        id: group.id.slice(5),
        key: keysById.get(group.id.slice(5)),
        name: group.name,
        issueIds: group.issueIds
      })),
    sprints: legacy.manifest.groups
      .filter((group) => group.kind === "sprint")
      .map((group) => ({
        id: group.id.slice(7),
        name: group.name,
        state: group.state,
        issueIds: group.issueIds,
        startsAt: group.startsAt,
        endsAt: group.endsAt
      })),
    versionsReleases: legacy.manifest.groups
      .filter((group) => group.kind === "milestone")
      .map((group) => ({
        id: group.id.slice("version:".length),
        name: group.name,
        released: group.state === "completed",
        releaseDate: group.endsAt,
        issueIds: group.issueIds
      })),
    ranks: issues.flatMap((issue) =>
      fields
        .filter(
          (field) =>
            field.schema?.custom?.includes(":rank") ||
            field.name.toLowerCase() === "rank"
        )
        .flatMap((field) => {
          const rank = customFieldText(issue.fields[field.id])
          return rank === null
            ? []
            : [{ id: `${issue.id}:${field.id}`, issueId: issue.id, rank }]
        })
    ),
    links: unique(
      issues.flatMap((issue) =>
        (issue.fields.issuelinks ?? []).flatMap((link) => {
          const id = link.id
          const inward = link.inwardIssue?.id ?? null
          const outward = link.outwardIssue?.id ?? null
          return id === null || (inward === null && outward === null)
            ? []
            : [
                {
                  id,
                  type: link.type?.name ?? "unknown",
                  inwardIssueId: inward ?? issue.id,
                  outwardIssueId: outward ?? issue.id
                }
              ]
        })
      ),
      (link) => link.id
    ),
    restrictions: legacy.manifest.restrictions,
    productApps: [
      {
        id: data.project.projectTypeKey ?? "unknown",
        kind: "product",
        name: data.project.projectTypeKey ?? "unknown",
        detected: data.project.projectTypeKey != null
      },
      ...unique(
        fields.flatMap((field) => {
          const custom = field.schema?.custom
          return custom == null
            ? []
            : [{ id: custom, kind: "app", name: custom, detected: true }]
        }),
        (app) => app.id
      )
    ],
    customFields: fields
      .filter((field) => field.custom === true)
      .map((field) => ({
        id: field.id,
        name: field.name,
        type: field.schema?.type ?? "unknown",
        valuesArtifact: ref("custom-field", field.id)
      })),
    coverage: [
      ...new Set([
        ...data.chunks.map((chunk) => chunk.kind),
        ...(issues.length === 0 ? [] : ISSUE_DEPENDENT_SCAN_KINDS)
      ])
    ].map((category) => {
      const warnings = [
        ...data.chunks
          .filter((chunk) => chunk.kind === category)
          .flatMap((chunk) => chunk.warnings),
        ...(category === "issues"
          ? issues.flatMap((issue) => issue.normalizationWarnings ?? [])
          : []),
        ...(category === "fields"
          ? fields.flatMap((field) => field.normalizationWarnings)
          : [])
      ]
      return {
        category,
        visibility: warnings.length > 0 ? "partial" : "visible-only",
        reason: warnings.includes("permission_denied")
          ? "permission_denied"
          : (warnings[0] ?? "jira-permissions")
      }
    }),
    warnings: [
      ...fields.flatMap((field) =>
        field.normalizationWarnings.map((message, index) => ({
          id: `${field.id}:normalization:${index}`,
          category: "fields",
          message
        }))
      ),
      ...issues.flatMap((issue) =>
        (issue.normalizationWarnings ?? []).map((message, index) => ({
          id: `${issue.id}:normalization:${index}`,
          category: "issues",
          message
        }))
      ),
      ...data.chunks.flatMap((chunk) =>
        chunk.warnings.map((reason) => ({
          id: `${chunk.raw.key}:${reason}`,
          category: chunk.kind,
          message: reason
        }))
      ),
      {
        id: "workflow-metadata",
        category: "workflows",
        message:
          "Workflow metadata describes visible issue-type status membership; transitions are not exposed by this scan."
      }
    ],
    rawArtifacts: data.chunks.map((chunk) => chunk.raw),
    schemaVersions: [{ id: "jira-manifest", version: "2" }],
    converterVersions: [{ id: "jira-adf", version: "1" }]
  })
  const deduped = dedupeScanManifestV2(manifest)
  yield* validateScanManifestV2(deduped.manifest)
  return {
    manifest: normalizeJiraMigrationManifestV2(deduped.manifest),
    repairs: [...legacy.repairs, ...deduped.findings]
  }
})
const decodeManifestRecordIdentity = Schema.decodeUnknownOption(
  Schema.Struct({
    id: Schema.optional(Schema.String),
    accountId: Schema.optional(Schema.String),
    key: Schema.optional(Schema.String)
  })
)
const manifestRecordId = (value: unknown): string | null =>
  decodeManifestRecordIdentity(value).pipe(
    Option.flatMap((identity) =>
      Option.fromNullishOr(identity.id ?? identity.accountId ?? identity.key)
    ),
    Option.getOrNull
  )

export const dedupeScanManifestV2 = (manifest: JiraMigrationManifestV2) => {
  const findings: Array<JiraMigrationFinding> = []
  const deduped: Record<string, unknown> = {}
  for (const [name, values] of Object.entries(manifest)) {
    if (!Array.isArray(values)) {
      deduped[name] = values
      continue
    }
    const seen = new Set<string>()
    deduped[name] = values.filter((value) => {
      const id = manifestRecordId(value)
      if (id === null) return true
      if (!seen.has(id)) {
        seen.add(id)
        return true
      }
      findings.push(
        jiraFinding(
          "source-duplicate-dropped",
          `${name} ${id}`,
          "Jira returned this record more than once; the first copy was kept and the others were ignored.",
          id
        )
      )
      return false
    })
  }
  return { manifest: deduped as JiraMigrationManifestV2, findings }
}

const invalidManifest = (reason: string, subject: string, detail: string) =>
  new JiraScanFailure({
    reason,
    retryable: false,
    reconnect: false,
    subject,
    detail
  })
const invalidReference = (subject: string, detail: string) =>
  invalidManifest("jira_migration_invalid_reference", subject, detail)

export const validateScanManifestV2 = Effect.fn("validateScanManifestV2")(
  function* (manifest: JiraMigrationManifestV2) {
    const issues = new Set(manifest.issues.map((issue) => issue.id))
    const issueKeys = new Map(
      manifest.issues.map((issue) => [issue.id, issue.key])
    )
    const keyOf = (issueId: string) => issueKeys.get(issueId) ?? issueId
    const statuses = new Set(manifest.statuses.map((status) => status.id))
    const types = new Set(manifest.issueTypes.map((type) => type.id))
    const priorities = new Set(manifest.priorities.map((value) => value.id))
    const identities = new Set(
      manifest.identities.map((value) => value.accountId)
    )
    const components = new Set(manifest.components.map((value) => value.id))
    const commentIds = new Set(manifest.comments.map((value) => value.id))
    const worklogIds = new Set(manifest.worklogs.map((value) => value.id))
    for (const restriction of manifest.restrictions) {
      const targets = Match.value(restriction.targetKind).pipe(
        Match.when("issue", () => issues),
        Match.when("comment", () => commentIds),
        Match.orElse(() => worklogIds)
      )
      if (!targets.has(restriction.targetId))
        return yield* invalidReference(
          `restriction ${restriction.id}`,
          `restricted ${restriction.targetKind} ${restriction.targetId} is not in the scan`
        )
    }
    for (const workflow of manifest.workflows) {
      const missing = workflow.statusIds.find((id) => !statuses.has(id))
      if (missing !== undefined)
        return yield* invalidReference(
          `workflow ${workflow.name}`,
          `status ${missing} is not in the scan`
        )
    }
    for (const group of [
      ...manifest.epics,
      ...manifest.sprints,
      ...manifest.versionsReleases
    ]) {
      const missing = group.issueIds.find((id) => !issues.has(id))
      if (missing !== undefined)
        return yield* invalidReference(
          `group ${group.id}`,
          `issue ${missing} is not in the scan`
        )
    }
    for (const value of [...manifest.watchers, ...manifest.votes])
      if (!identities.has(value.accountId))
        return yield* invalidReference(
          `${keyOf(value.issueId)} watcher or vote`,
          `account ${value.accountId} is not in the scan`
        )
    const issueTypeIds = new Map(
      manifest.issues.map((issue) => [issue.id, issue.issueTypeId])
    )
    const subtaskTypes = new Set(
      manifest.issueTypes.filter((type) => type.subtask).map(({ id }) => id)
    )
    for (const relation of manifest.parentsSubtasks) {
      const childType = issueTypeIds.get(relation.subtaskIssueId)
      if (childType === undefined)
        return yield* invalidReference(
          `sub-task ${relation.subtaskIssueId}`,
          `issue ${relation.subtaskIssueId} is not in the scan`
        )
      if (!subtaskTypes.has(childType))
        return yield* invalidManifest(
          "jira_migration_invalid_subtask",
          keyOf(relation.subtaskIssueId),
          `issue type ${childType} is not a sub-task type`
        )
    }
    for (const issue of manifest.issues) {
      const problem = !statuses.has(issue.statusId)
        ? `status ${issue.statusId}`
        : !types.has(issue.issueTypeId)
          ? `issue type ${issue.issueTypeId}`
          : issue.priorityId !== null && !priorities.has(issue.priorityId)
            ? `priority ${issue.priorityId}`
            : issue.componentIds.find((id) => !components.has(id)) !== undefined
              ? `component ${issue.componentIds.find((id) => !components.has(id))}`
              : [issue.assigneeAccountId, issue.reporterAccountId].find(
                    (id) => id !== null && !identities.has(id)
                  ) !== undefined
                ? "assignee or reporter account"
                : null
      if (problem !== null)
        return yield* invalidReference(
          issue.key,
          `${problem} is not in the scan`
        )
    }
    for (const value of [
      ...manifest.comments,
      ...manifest.worklogs,
      ...manifest.changelogs,
      ...manifest.watchers,
      ...manifest.votes,
      ...manifest.attachments,
      ...manifest.ranks
    ]) {
      if (!issues.has(value.issueId))
        return yield* invalidReference(
          `record ${value.id}`,
          `issue ${value.issueId} is not in the scan`
        )
    }
    for (const value of [
      ...manifest.comments,
      ...manifest.worklogs,
      ...manifest.changelogs
    ]) {
      if (
        value.authorAccountId !== null &&
        !identities.has(value.authorAccountId)
      )
        return yield* invalidReference(
          `${keyOf(value.issueId)} record ${value.id}`,
          `author ${value.authorAccountId} is not in the scan`
        )
    }
    return undefined
  }
)
