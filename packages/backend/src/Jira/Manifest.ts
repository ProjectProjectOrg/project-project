import * as Schema from "effect/Schema"

export const JIRA_MIGRATION_MANIFEST_VERSION = 1 as const

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

export const JiraMigrationManifest = Schema.Struct({
  version: Schema.Literal(JIRA_MIGRATION_MANIFEST_VERSION),
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
export type JiraMigrationManifest = typeof JiraMigrationManifest.Type

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
