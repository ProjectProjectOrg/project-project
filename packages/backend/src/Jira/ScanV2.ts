import { DateTime, Effect, Option, Schema } from "effect"
import type { JiraMigrationUserOption } from "@projectproject/shared"
import * as C from "./ClientSchemas"
import {
  JiraMigrationManifestV2,
  normalizeJiraMigrationManifestV2
} from "./Manifest"
import type { JiraArtifactRef } from "./MigrationArtifacts"
import {
  scanFailure,
  type JiraScanContext,
  type JiraScanKind
} from "./MigrationActivities"
import { buildJiraScanArtifacts } from "./Scan"

export interface ScanChunkReference {
  readonly kind: JiraScanKind
  readonly parentId: string | null
  readonly raw: JiraArtifactRef
  readonly normalized: JiraArtifactRef
  readonly warnings: ReadonlyArray<string>
}
export interface ScanChunk extends ScanChunkReference {
  readonly values: ReadonlyArray<unknown>
}
const RecordValue = Schema.Record(Schema.String, Schema.Unknown)
const asRecord = (value: unknown): Readonly<Record<string, unknown>> =>
  Schema.decodeUnknownOption(RecordValue)(value).pipe(
    Option.getOrElse(() => ({}))
  )
const asString = (value: unknown) =>
  Schema.decodeUnknownOption(Schema.NonEmptyString)(value).pipe(
    Option.getOrNull
  )
const asArray = (value: unknown) =>
  Schema.decodeUnknownOption(Schema.Array(Schema.Unknown))(value).pipe(
    Option.getOrElse(() => [])
  )
const idOf = (value: unknown) => asString(asRecord(value).id)
const userOf = (value: unknown) =>
  Schema.decodeUnknownOption(C.JiraUser)(value).pipe(Option.getOrNull)
const unique = <A>(values: ReadonlyArray<A>, key: (value: A) => string) => [
  ...new Map(values.map((value) => [key(value), value])).values()
]

export const normalizeScanPageValues = (values: ReadonlyArray<unknown>) =>
  values.toSorted((left, right) => {
    const key = (value: unknown) => {
      const record = asRecord(value)
      return Schema.decodeUnknownOption(
        Schema.Union([Schema.String, Schema.Finite])
      )(record.id ?? record.accountId).pipe(
        Option.map(String),
        Option.getOrElse(() => "")
      )
    }
    return key(left) < key(right) ? -1 : key(left) > key(right) ? 1 : 0
  })

export const prepareScanV2 = Effect.fn("prepareScanV2")(function* (
  context: JiraScanContext,
  chunks: ReadonlyArray<ScanChunk>,
  identityOptions: ReadonlyArray<JiraMigrationUserOption>
) {
  const read = <A>(kind: JiraScanKind, schema: Schema.Decoder<A>) =>
    Schema.decodeUnknownEffect(Schema.Array(schema))(
      chunks
        .filter((chunk) => chunk.kind === kind)
        .flatMap((chunk) => chunk.values)
    )
  const project = (yield* read("project", C.JiraProject))[0]
  const account = (yield* read("account", C.JiraUser))[0]
  if (!project || !account)
    return yield* scanFailure("jira_migration_missing_metadata")
  const issues = yield* read("issues", C.JiraIssue)
  const fields = yield* read("fields", C.JiraField)
  const statuses = yield* read("statuses", C.JiraIssueTypeStatuses)
  const priorities = yield* read("priorities", C.JiraPriority)
  const components = yield* read("components", C.JiraComponent)
  const versions = yield* read("versions", C.JiraVersion)
  const sprints = unique(yield* read("sprints", C.JiraSprint), (sprint) =>
    String(sprint.id)
  )
  const nested = <A>(kind: JiraScanKind, schema: Schema.Decoder<A>) =>
    Effect.forEach(
      chunks.filter((chunk) => chunk.kind === kind),
      (chunk) =>
        Schema.decodeUnknownEffect(Schema.Array(schema))(chunk.values).pipe(
          Effect.map((values) =>
            values.map((value) => ({ issueId: chunk.parentId!, value }))
          )
        )
    ).pipe(Effect.map((values) => values.flat()))
  const comments = yield* nested("comments", C.JiraComment)
  const changelogs = yield* nested("changelogs", C.JiraChangelog)
  const worklogs = yield* nested("worklogs", C.JiraWorklog)
  const watchers = yield* nested("watchers", C.JiraWatchers)
  const votes = yield* nested("votes", C.JiraVotes)
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
      const refs = yield* Schema.decodeUnknownEffect(
        Schema.Array(C.JiraIssueReference)
      )(memberships)
      return {
        sprint,
        issueIds: unique(refs, (value) => value.id).map((value) => value.id)
      }
    })
  )
  const extraUsers = [
    account,
    ...issues.flatMap((issue) => [
      userOf(issue.fields.reporter),
      userOf(issue.fields.creator)
    ]),
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
  const manifest = yield* Schema.decodeUnknownEffect(JiraMigrationManifestV2)({
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
      type: asString(asRecord(field.schema).type) ?? "unknown"
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
        userOf(issues.find((source) => source.id === issue.id)?.fields.reporter)
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
        fieldId: asString(item.fieldId) ?? asString(item.field) ?? "unknown",
        from: asString(item.from),
        to: asString(item.to)
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
            asString(asRecord(field.schema).custom)?.includes(":rank") ||
            field.name.toLowerCase() === "rank"
        )
        .flatMap((field) => {
          const rank = asString(issue.fields[field.id])
          return rank === null
            ? []
            : [{ id: `${issue.id}:${field.id}`, issueId: issue.id, rank }]
        })
    ),
    links: unique(
      issues.flatMap((issue) =>
        asArray(issue.fields.issuelinks).flatMap((value) => {
          const link = asRecord(value)
          const id = asString(link.id)
          const inward = idOf(link.inwardIssue)
          const outward = idOf(link.outwardIssue)
          return id === null || (inward === null && outward === null)
            ? []
            : [
                {
                  id,
                  type: asString(asRecord(link.type).name) ?? "unknown",
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
          const custom = asString(asRecord(field.schema).custom)
          return custom === null
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
        type: asString(asRecord(field.schema).type) ?? "unknown",
        valuesArtifact: ref("custom-field", field.id)
      })),
    coverage: [...new Set(data.chunks.map((chunk) => chunk.kind))].map(
      (category) => {
        const warnings = data.chunks
          .filter((chunk) => chunk.kind === category)
          .flatMap((chunk) => chunk.warnings)
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
        const item = asRecord(value)
        const id =
          asString(item.id) ?? asString(item.accountId) ?? asString(item.key)
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
      const targets =
        restriction.targetKind === "issue"
          ? issues
          : restriction.targetKind === "comment"
            ? commentIds
            : worklogIds
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
