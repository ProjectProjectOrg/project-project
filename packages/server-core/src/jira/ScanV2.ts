import type { JiraMigrationUserOption } from "@pp/shared"
import { DateTime, Effect, Option, Result, Schema, SchemaIssue } from "effect"
import * as Match from "effect/Match"

import * as C from "./ClientSchemas"
import {
  JiraMigrationManifestV2,
  normalizeJiraMigrationManifestV2
} from "./Manifest"
import {
  scanFailure,
  type JiraScanContext,
  type JiraScanKind
} from "./MigrationActivities"
import type { JiraArtifactRef } from "./MigrationArtifacts"
import { buildJiraScanArtifacts } from "./Scan"

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
  raw: JiraArtifactRef
  normalized: JiraArtifactRef
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
  const comments = yield* nested("comments", decodeUnknownJiraCommentArray)
  const changelogs = yield* nested(
    "changelogs",
    decodeUnknownJiraChangelogArray
  )
  const worklogs = yield* nested("worklogs", decodeUnknownJiraWorklogArray)
  const watchers = yield* nested("watchers", decodeUnknownJiraWatchersArray)
  const votes = yield* nested("votes", decodeUnknownJiraVotesArray)
  const byIssue = <A>(values: ReadonlyArray<{ issueId: string; value: A }>) =>
    Object.fromEntries(
      issues.map((issue) => [
        issue.id,
        values
          .filter((item) => item.issueId === issue.id)
          .map((item) => item.value)
      ])
    )
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
  const requirements = {
    ...legacy.requirements,
    identities: identities.map((identity) => ({
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
  refs: ReadonlyMap<string, JiraArtifactRef>
) {
  const { context, legacy, issues, fields } = data
  const ref = (kind: string, id: string) => refs.get(`${kind}:${id}`)
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
    issues: legacy.manifest.issues.map((issue) => ({
      ...issue,
      descriptionArtifact: ref("description", issue.id) ?? null,
      reporterAccountId:
        issues.find((source) => source.id === issue.id)?.fields.reporter
          ?.accountId ?? null,
      labelIds: issue.labels
    })),
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
          legacy.manifest.issueTypes.some(
            (type) => type.id === issue.issueTypeId && type.subtask
          )
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
        key: legacy.manifest.issues.find(
          (issue) => `epic:${issue.id}` === group.id
        )?.key,
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
    versionsReleases: data.versions.map((version) => ({
      id: version.id,
      name: version.name,
      released: version.released ?? false,
      releaseDate: version.releaseDate ?? null,
      issueIds: legacy.manifest.issues
        .filter((issue) => issue.groupIds.includes(`version:${version.id}`))
        .map((issue) => issue.id)
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
    coverage: [...new Set(data.chunks.map((chunk) => chunk.kind))].map(
      (category) => {
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
      }
    ),
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
  yield* validateScanManifestV2(manifest)
  return normalizeJiraMigrationManifestV2(manifest)
})
export const validateScanManifestV2 = Effect.fn("validateScanManifestV2")(
  function* (manifest: JiraMigrationManifestV2) {
    for (const [name, values] of Object.entries(manifest)) {
      if (!Array.isArray(values)) continue
      const ids = values.flatMap((value) => {
        const id = Match.value(value).pipe(
          Match.when({ id: Match.string }, ({ id }) => id),
          Match.when({ accountId: Match.string }, ({ accountId }) => accountId),
          Match.when({ key: Match.string }, ({ key }) => key),
          Match.orElse(() => null)
        )
        return id === null ? [] : [id]
      })
      if (new Set(ids).size !== ids.length)
        return yield* scanFailure(`jira_migration_duplicate_${name}`)
    }
    const issues = new Set(manifest.issues.map((issue) => issue.id))
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
        return yield* scanFailure("jira_migration_invalid_reference")
    }
    for (const workflow of manifest.workflows)
      if (workflow.statusIds.some((id) => !statuses.has(id)))
        return yield* scanFailure("jira_migration_invalid_reference")
    for (const group of [
      ...manifest.epics,
      ...manifest.sprints,
      ...manifest.versionsReleases
    ])
      if (group.issueIds.some((id) => !issues.has(id)))
        return yield* scanFailure("jira_migration_invalid_reference")
    for (const value of [...manifest.watchers, ...manifest.votes])
      if (!identities.has(value.accountId))
        return yield* scanFailure("jira_migration_invalid_reference")
    for (const relation of manifest.parentsSubtasks) {
      const child = manifest.issues.find(
        (issue) => issue.id === relation.subtaskIssueId
      )
      if (child === undefined)
        return yield* scanFailure("jira_migration_invalid_reference")
      if (
        !manifest.issueTypes.some(
          (type) => type.id === child.issueTypeId && type.subtask
        )
      )
        return yield* scanFailure("jira_migration_invalid_subtask")
    }
    for (const issue of manifest.issues) {
      if (
        !statuses.has(issue.statusId) ||
        !types.has(issue.issueTypeId) ||
        (issue.priorityId !== null && !priorities.has(issue.priorityId)) ||
        issue.componentIds.some((id) => !components.has(id)) ||
        [issue.assigneeAccountId, issue.reporterAccountId].some(
          (id) => id !== null && !identities.has(id)
        )
      )
        return yield* scanFailure("jira_migration_invalid_reference")
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
        return yield* scanFailure("jira_migration_invalid_reference")
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
        return yield* scanFailure("jira_migration_invalid_reference")
    }
    return undefined
  }
)
