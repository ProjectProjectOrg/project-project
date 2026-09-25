import * as Schema from "effect/Schema"
export const canonicalJiraJson = (value: Schema.Json): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJiraJson).join(",")}]`
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJiraJson(item)}`)
      .join(",")}}`
  return JSON.stringify(value)
}
import { JiraArtifactRef } from "./MigrationArtifacts"

export const JIRA_MIGRATION_MANIFEST_VERSION = 2 as const
export const JIRA_MIGRATION_MANIFEST_V1_VERSION = 1 as const

export const JiraAdfWarning = Schema.Struct({
  path: Schema.Array(Schema.Union([Schema.String, Schema.Finite])),
  nodeType: Schema.String,
  reason: Schema.String
})
export type JiraAdfWarning = typeof JiraAdfWarning.Type

export const JiraAdfReference = Schema.Struct({
  kind: Schema.Literals(["jira-issue", "jira-attachment", "jira-user"]),
  sourceId: Schema.String,
  placeholder: Schema.String,
  originalUrl: Schema.NullOr(Schema.String),
  fallbackText: Schema.String
})
export type JiraAdfReference = typeof JiraAdfReference.Type

export const JiraConvertedText = Schema.Struct({
  markdown: Schema.String,
  warnings: Schema.Array(JiraAdfWarning),
  references: Schema.Array(JiraAdfReference),
  adf: Schema.Unknown
})
export type JiraConvertedText = typeof JiraConvertedText.Type

export const JiraManifestSource = Schema.Struct({
  cloudId: Schema.NonEmptyString,
  siteUrl: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  projectKey: Schema.NonEmptyString,
  projectName: Schema.NonEmptyString,
  productType: Schema.NullOr(Schema.String),
  scannedAt: Schema.NonEmptyString,
  description: Schema.optional(Schema.NullOr(JiraConvertedText)),
  raw: Schema.optional(Schema.Unknown)
})
export type JiraManifestSource = typeof JiraManifestSource.Type

export const JiraManifestIdentity = Schema.Struct({
  accountId: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  emailAddress: Schema.NullOr(Schema.String),
  active: Schema.NullOr(Schema.Boolean),
  accountType: Schema.NullOr(Schema.String),
  raw: Schema.Unknown
})
export type JiraManifestIdentity = typeof JiraManifestIdentity.Type

export const JiraManifestStatus = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  categoryKey: Schema.NullOr(Schema.String),
  raw: Schema.Unknown
})
export type JiraManifestStatus = typeof JiraManifestStatus.Type

export const JiraManifestIssueType = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  subtask: Schema.Boolean,
  raw: Schema.Unknown
})
export type JiraManifestIssueType = typeof JiraManifestIssueType.Type

export const JiraManifestPriority = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  raw: Schema.Unknown
})
export type JiraManifestPriority = typeof JiraManifestPriority.Type

export const JiraManifestComponent = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.String),
  raw: Schema.Unknown
})
export type JiraManifestComponent = typeof JiraManifestComponent.Type

export const JiraManifestIssue = Schema.Struct({
  id: Schema.NonEmptyString,
  key: Schema.NonEmptyString,
  issueNumber: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  summary: Schema.NonEmptyString,
  description: Schema.NullOr(JiraConvertedText),
  statusId: Schema.NonEmptyString,
  issueTypeId: Schema.NonEmptyString,
  priorityId: Schema.NullOr(Schema.String),
  assigneeAccountId: Schema.NullOr(Schema.String),
  labels: Schema.Array(Schema.String),
  componentIds: Schema.Array(Schema.String),
  groupIds: Schema.Array(Schema.String),
  parentIssueId: Schema.NullOr(Schema.String),
  attachmentIds: Schema.Array(Schema.String),
  restricted: Schema.Boolean,
  createdAt: Schema.NonEmptyString,
  updatedAt: Schema.NonEmptyString,
  raw: Schema.Unknown
})
export type JiraManifestIssue = typeof JiraManifestIssue.Type

export const JiraManifestComment = Schema.Struct({
  id: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  authorAccountId: Schema.NonEmptyString,
  authorDisplayName: Schema.NonEmptyString,
  body: JiraConvertedText,
  createdAt: Schema.NonEmptyString,
  updatedAt: Schema.NullOr(Schema.String),
  restricted: Schema.Boolean,
  raw: Schema.Unknown
})
export type JiraManifestComment = typeof JiraManifestComment.Type

export const JiraManifestAttachment = Schema.Struct({
  id: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  filename: Schema.NonEmptyString,
  mimeType: Schema.NonEmptyString,
  byteSize: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  downloadUrl: Schema.NullOr(Schema.String),
  jiraUrl: Schema.NullOr(Schema.String),
  downloadAllowed: Schema.Boolean,
  raw: Schema.Unknown
})
export type JiraManifestAttachment = typeof JiraManifestAttachment.Type

export const JiraManifestGroup = Schema.Struct({
  id: Schema.NonEmptyString,
  kind: Schema.Literals(["sprint", "epic", "milestone"]),
  name: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.String),
  state: Schema.NullOr(
    Schema.Literals(["completed", "active", "future", "other"])
  ),
  issueIds: Schema.Array(Schema.String),
  startsAt: Schema.NullOr(Schema.String),
  endsAt: Schema.NullOr(Schema.String),
  completedAt: Schema.NullOr(Schema.String),
  raw: Schema.Unknown
})
export type JiraManifestGroup = typeof JiraManifestGroup.Type

export const JiraManifestRestriction = Schema.Struct({
  id: Schema.NonEmptyString,
  targetKind: Schema.Literals(["issue", "comment", "worklog"]),
  targetId: Schema.NonEmptyString,
  source: Schema.String,
  raw: Schema.Unknown
})
export type JiraManifestRestriction = typeof JiraManifestRestriction.Type

export const JiraManifestCoverage = Schema.Struct({
  category: Schema.NonEmptyString,
  visibility: Schema.Literals([
    "complete",
    "visible-only",
    "partial",
    "unknown"
  ]),
  reason: Schema.NullOr(Schema.String)
})
export type JiraManifestCoverage = typeof JiraManifestCoverage.Type

export const JiraManifestRawPage = Schema.Struct({
  kind: Schema.NonEmptyString,
  cursor: Schema.NullOr(Schema.String),
  records: Schema.Array(Schema.Unknown)
})
export type JiraManifestRawPage = typeof JiraManifestRawPage.Type

export const JiraMigrationManifestV1 = Schema.Struct({
  version: Schema.Literal(JIRA_MIGRATION_MANIFEST_V1_VERSION),
  migrationId: Schema.NonEmptyString,
  source: JiraManifestSource,
  identities: Schema.Array(JiraManifestIdentity),
  statuses: Schema.Array(JiraManifestStatus),
  issueTypes: Schema.Array(JiraManifestIssueType),
  priorities: Schema.Array(JiraManifestPriority),
  components: Schema.Array(JiraManifestComponent),
  issues: Schema.Array(JiraManifestIssue),
  comments: Schema.Array(JiraManifestComment),
  attachments: Schema.Array(JiraManifestAttachment),
  groups: Schema.Array(JiraManifestGroup),
  restrictions: Schema.Array(JiraManifestRestriction),
  coverage: Schema.Array(JiraManifestCoverage),
  rawPages: Schema.Array(JiraManifestRawPage)
})
export type JiraMigrationManifestV1 = typeof JiraMigrationManifestV1.Type

export const JiraMigrationManifest = JiraMigrationManifestV1
export type JiraMigrationManifest = JiraMigrationManifestV1

const NonNegativeInt = Schema.Int.pipe(
  Schema.check(Schema.isGreaterThanOrEqualTo(0))
)

export const JiraManifestSourceV2 = Schema.Struct({
  cloudId: Schema.NonEmptyString,
  siteUrl: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
  projectKey: Schema.NonEmptyString,
  projectName: Schema.NonEmptyString,
  scannedAt: Schema.NonEmptyString,
  visibleAccount: Schema.Struct({
    accountId: Schema.NonEmptyString,
    displayName: Schema.NonEmptyString,
    caveat: Schema.NonEmptyString
  })
})

export const JiraManifestWorkflowRunV2 = Schema.Struct({
  executionId: Schema.NonEmptyString,
  attempt: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))
})

export const JiraManifestFieldDefinitionV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  key: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  type: Schema.NonEmptyString
})

export const JiraManifestWorkflowV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  statusIds: Schema.Array(Schema.NonEmptyString)
})

export const JiraManifestIdentityV2 = Schema.Struct({
  accountId: Schema.NonEmptyString,
  displayName: Schema.NonEmptyString,
  emailAddress: Schema.NullOr(Schema.String),
  active: Schema.NullOr(Schema.Boolean),
  accountType: Schema.NullOr(Schema.String)
})

export const JiraManifestStatusV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  categoryKey: Schema.NullOr(Schema.String)
})

export const JiraManifestIssueTypeV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  subtask: Schema.Boolean
})

export const JiraManifestPriorityV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString
})

export const JiraManifestComponentV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  description: Schema.NullOr(Schema.String)
})

export const JiraManifestIssueV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  key: Schema.NonEmptyString,
  issueNumber: Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1))),
  summary: Schema.NonEmptyString,
  descriptionArtifact: Schema.NullOr(JiraArtifactRef),
  statusId: Schema.NonEmptyString,
  issueTypeId: Schema.NonEmptyString,
  priorityId: Schema.NullOr(Schema.String),
  assigneeAccountId: Schema.NullOr(Schema.String),
  reporterAccountId: Schema.NullOr(Schema.String),
  labelIds: Schema.Array(Schema.String),
  componentIds: Schema.Array(Schema.String),
  createdAt: Schema.NonEmptyString,
  updatedAt: Schema.NonEmptyString
})

export const JiraManifestCommentV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  authorAccountId: Schema.NonEmptyString,
  bodyArtifact: JiraArtifactRef,
  createdAt: Schema.NonEmptyString,
  updatedAt: Schema.NullOr(Schema.String),
  restricted: Schema.Boolean
})

export const JiraManifestChangelogV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  authorAccountId: Schema.NullOr(Schema.String),
  createdAt: Schema.NonEmptyString,
  changes: Schema.Array(
    Schema.Struct({
      fieldId: Schema.NonEmptyString,
      from: Schema.NullOr(Schema.String),
      to: Schema.NullOr(Schema.String)
    })
  )
})

export const JiraManifestWorklogV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  authorAccountId: Schema.NonEmptyString,
  seconds: NonNegativeInt,
  startedAt: Schema.NonEmptyString,
  bodyArtifact: Schema.NullOr(JiraArtifactRef),
  restricted: Schema.Boolean
})

export const JiraManifestWatcherV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  accountId: Schema.NonEmptyString
})

export const JiraManifestVoteV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  accountId: Schema.NonEmptyString
})

export const JiraManifestAttachmentV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  filename: Schema.NonEmptyString,
  mimeType: Schema.NonEmptyString,
  byteSize: NonNegativeInt,
  metadataArtifact: JiraArtifactRef,
  downloadUrl: Schema.NullOr(Schema.String),
  jiraUrl: Schema.NullOr(Schema.String),
  downloadAllowed: Schema.Boolean
})

export const JiraManifestParentSubtaskV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  parentIssueId: Schema.NonEmptyString,
  subtaskIssueId: Schema.NonEmptyString
})

export const JiraManifestEpicV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  key: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  issueIds: Schema.Array(Schema.NonEmptyString)
})

export const JiraManifestSprintV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  state: Schema.Literals(["completed", "active", "future", "other"]),
  issueIds: Schema.Array(Schema.NonEmptyString),
  startsAt: Schema.NullOr(Schema.String),
  endsAt: Schema.NullOr(Schema.String)
})

export const JiraManifestVersionReleaseV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  released: Schema.Boolean,
  releaseDate: Schema.NullOr(Schema.String),
  issueIds: Schema.Array(Schema.NonEmptyString)
})

export const JiraManifestRankV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  rank: Schema.NonEmptyString
})

export const JiraManifestLinkV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  type: Schema.NonEmptyString,
  inwardIssueId: Schema.NonEmptyString,
  outwardIssueId: Schema.NonEmptyString
})

export const JiraManifestRestrictionV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  targetKind: Schema.Literals(["issue", "comment", "worklog"]),
  targetId: Schema.NonEmptyString,
  source: Schema.NonEmptyString
})

export const JiraManifestProductAppV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  kind: Schema.Literals(["product", "app"]),
  name: Schema.NonEmptyString,
  detected: Schema.Boolean
})

export const JiraManifestCustomFieldV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  type: Schema.NonEmptyString,
  valuesArtifact: JiraArtifactRef
})

export const JiraManifestWarningV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  category: Schema.NonEmptyString,
  message: Schema.NonEmptyString
})

export const JiraManifestVersionV2 = Schema.Struct({
  id: Schema.NonEmptyString,
  version: Schema.NonEmptyString
})

export const JiraMigrationManifestV2 = Schema.Struct({
  version: Schema.Literal(JIRA_MIGRATION_MANIFEST_VERSION),
  migrationId: Schema.NonEmptyString,
  scanRevision: NonNegativeInt,
  source: JiraManifestSourceV2,
  workflow: JiraManifestWorkflowRunV2,
  fieldDefinitions: Schema.Array(JiraManifestFieldDefinitionV2),
  workflows: Schema.Array(JiraManifestWorkflowV2),
  identities: Schema.Array(JiraManifestIdentityV2),
  statuses: Schema.Array(JiraManifestStatusV2),
  issueTypes: Schema.Array(JiraManifestIssueTypeV2),
  priorities: Schema.Array(JiraManifestPriorityV2),
  components: Schema.Array(JiraManifestComponentV2),
  issues: Schema.Array(JiraManifestIssueV2),
  comments: Schema.Array(JiraManifestCommentV2),
  changelogs: Schema.Array(JiraManifestChangelogV2),
  worklogs: Schema.Array(JiraManifestWorklogV2),
  watchers: Schema.Array(JiraManifestWatcherV2),
  votes: Schema.Array(JiraManifestVoteV2),
  attachments: Schema.Array(JiraManifestAttachmentV2),
  parentsSubtasks: Schema.Array(JiraManifestParentSubtaskV2),
  epics: Schema.Array(JiraManifestEpicV2),
  sprints: Schema.Array(JiraManifestSprintV2),
  versionsReleases: Schema.Array(JiraManifestVersionReleaseV2),
  ranks: Schema.Array(JiraManifestRankV2),
  links: Schema.Array(JiraManifestLinkV2),
  restrictions: Schema.Array(JiraManifestRestrictionV2),
  productApps: Schema.Array(JiraManifestProductAppV2),
  customFields: Schema.Array(JiraManifestCustomFieldV2),
  coverage: Schema.Array(JiraManifestCoverage),
  warnings: Schema.Array(JiraManifestWarningV2),
  rawArtifacts: Schema.Array(JiraArtifactRef),
  schemaVersions: Schema.Array(JiraManifestVersionV2),
  converterVersions: Schema.Array(JiraManifestVersionV2)
})
export type JiraMigrationManifestV2 = typeof JiraMigrationManifestV2.Type

export function normalizeJiraMigrationManifestV2(
  manifest: JiraMigrationManifestV2
): JiraMigrationManifestV2 {
  return {
    ...manifest,
    fieldDefinitions: sortBy(manifest.fieldDefinitions, ({ id }) => id),
    workflows: sortBy(manifest.workflows, ({ id }) => id).map((workflow) => ({
      ...workflow,
      statusIds: sortStrings(workflow.statusIds)
    })),
    identities: sortBy(manifest.identities, ({ accountId }) => accountId),
    statuses: sortBy(manifest.statuses, ({ id }) => id),
    issueTypes: sortBy(manifest.issueTypes, ({ id }) => id),
    priorities: sortBy(manifest.priorities, ({ id }) => id),
    components: sortBy(manifest.components, ({ id }) => id),
    issues: sortBy(manifest.issues, ({ id }) => id).map((issue) => ({
      ...issue,
      labelIds: sortStrings(issue.labelIds),
      componentIds: sortStrings(issue.componentIds)
    })),
    comments: sortBy(manifest.comments, ({ id }) => id),
    changelogs: sortBy(manifest.changelogs, ({ id }) => id).map(
      (changelog) => ({
        ...changelog,
        changes: sortBy(
          changelog.changes,
          ({ fieldId, from, to }) =>
            `${fieldId}\u0000${from ?? ""}\u0000${to ?? ""}`
        )
      })
    ),
    worklogs: sortBy(manifest.worklogs, ({ id }) => id),
    watchers: sortBy(manifest.watchers, ({ id }) => id),
    votes: sortBy(manifest.votes, ({ id }) => id),
    attachments: sortBy(manifest.attachments, ({ id }) => id),
    parentsSubtasks: sortBy(manifest.parentsSubtasks, ({ id }) => id),
    epics: sortBy(manifest.epics, ({ id }) => id).map((epic) => ({
      ...epic,
      issueIds: sortStrings(epic.issueIds)
    })),
    sprints: sortBy(manifest.sprints, ({ id }) => id).map((sprint) => ({
      ...sprint,
      issueIds: sortStrings(sprint.issueIds)
    })),
    versionsReleases: sortBy(manifest.versionsReleases, ({ id }) => id).map(
      (version) => ({
        ...version,
        issueIds: sortStrings(version.issueIds)
      })
    ),
    ranks: sortBy(manifest.ranks, ({ id }) => id),
    links: sortBy(manifest.links, ({ id }) => id),
    restrictions: sortBy(manifest.restrictions, ({ id }) => id),
    productApps: sortBy(manifest.productApps, ({ id }) => id),
    customFields: sortBy(manifest.customFields, ({ id }) => id),
    coverage: sortBy(manifest.coverage, ({ category }) => category),
    warnings: sortBy(manifest.warnings, ({ id }) => id),
    rawArtifacts: sortBy(manifest.rawArtifacts, ({ key }) => key),
    schemaVersions: sortBy(manifest.schemaVersions, ({ id }) => id),
    converterVersions: sortBy(manifest.converterVersions, ({ id }) => id)
  }
}

export function normalizeJiraManifest(
  manifest: JiraMigrationManifest
): JiraMigrationManifest {
  return {
    ...manifest,
    identities: sortBy(manifest.identities, ({ accountId }) => accountId),
    statuses: sortBy(manifest.statuses, ({ id }) => id),
    issueTypes: sortBy(manifest.issueTypes, ({ id }) => id),
    priorities: sortBy(manifest.priorities, ({ id }) => id),
    components: sortBy(manifest.components, ({ id }) => id),
    issues: manifest.issues
      .toSorted(
        (left, right) =>
          left.issueNumber - right.issueNumber ||
          compareStrings(left.key, right.key) ||
          compareStrings(left.id, right.id)
      )
      .map((issue) =>
        Object.assign({}, issue, {
          labels: sortStrings(issue.labels),
          componentIds: sortStrings(issue.componentIds),
          groupIds: sortStrings(issue.groupIds),
          attachmentIds: sortStrings(issue.attachmentIds)
        })
      ),
    comments: sortBy(manifest.comments, ({ id }) => id),
    attachments: sortBy(manifest.attachments, ({ id }) => id),
    groups: sortBy(manifest.groups, ({ id }) => id).map((group) =>
      Object.assign({}, group, { issueIds: sortStrings(group.issueIds) })
    ),
    restrictions: sortBy(
      manifest.restrictions,
      ({ targetKind, targetId, id }) =>
        `${targetKind}\u0000${targetId}\u0000${id}`
    ),
    coverage: sortBy(manifest.coverage, ({ category }) => category),
    rawPages: manifest.rawPages.toSorted(
      (left, right) =>
        compareStrings(left.kind, right.kind) ||
        compareNullableStrings(left.cursor, right.cursor)
    )
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareNullableStrings(
  left: string | null,
  right: string | null
): number {
  if (left === right) return 0
  if (left === null) return -1
  if (right === null) return 1
  return compareStrings(left, right)
}

function sortStrings(values: ReadonlyArray<string>): Array<string> {
  return values.toSorted(compareStrings)
}

function sortBy<A>(
  values: ReadonlyArray<A>,
  key: (value: A) => string
): Array<A> {
  return values.toSorted((left, right) => compareStrings(key(left), key(right)))
}
