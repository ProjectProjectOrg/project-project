import { formatMentionHref } from "@projectproject/shared"
import { rewriteJiraReferences } from "./Adf"
import type {
  JiraConvertedText,
  JiraManifestAttachment,
  JiraManifestGroup,
  JiraMigrationManifest
} from "./Manifest"
import {
  buildOpenSprintConflicts,
  buildJiraStatusCreateOptions,
  jiraRestrictionPolicy,
  resolveTagDestinations,
  type JiraMappingSource,
  type JiraMigrationMappings
} from "./Mappings"
import type {
  JiraPreflightFinding,
  JiraPreflightBlockerCode,
  JiraPreflightResult
} from "./Preflight"
import { createHash } from "node:crypto"
import { DateTime, Effect, Schema } from "effect"
import { ulid } from "ulid"
import {
  AttachmentId,
  extractAttachmentRefs,
  attachmentUrl,
  BASELINE_STATUS_SEED,
  deriveProjectIdentity,
  GroupId,
  JiraMigrationConfiguration,
  pickStatusColor,
  ProjectKey,
  Slug,
  StatusSlug,
  TagName,
  TicketId,
  TicketPriority,
  TicketType
} from "@projectproject/shared"
import { generateKeyBetween } from "fractional-indexing"
import {
  JiraConvertedText as ConvertedTextSchema,
  JiraMigrationManifestV2,
  normalizeJiraMigrationManifestV2,
  canonicalJiraJson
} from "./Manifest"
import { JiraArtifactRef } from "./MigrationArtifacts"
import {
  JiraPreflightEnvironmentSchema,
  JiraPublicationInvalid,
  preflightJiraMigrationV2
} from "./Preflight"
import {
  buildJiraArchiveV2,
  buildJiraReportV2,
  JiraPlannedArchive,
  JiraPlannedReport
} from "./Report"
import { serializeCommentsRegion } from "../comments-region"
import { attachmentObjectKey } from "../Services/S3Storage"
export type JiraReferenceTarget = Readonly<{
  url: string
  text?: string
  embed?: boolean
}>

export type JiraReferenceTargets = Readonly<Record<string, JiraReferenceTarget>>

export type JiraStagedTicket = Readonly<{
  sourceIssueId: string
  sourceIssueKey: string
  id: string
  title: string
  status: string
  type: "feat" | "bug" | "chore" | "other"
  priority: "low" | "med" | "high"
  tags: ReadonlyArray<string>
  assignees: ReadonlyArray<string>
  body: string
  createdAt: string
  updatedAt: string
}>

export type JiraStagedComment = Readonly<{
  sourceCommentId: string
  ticketId: string
  author:
    | Readonly<{ kind: "user"; userId: string }>
    | Readonly<{
        kind: "jira"
        displayName: string
        accountId: string
      }>
  body: string
  createdAt: string
  editedAt: string | null
}>

export type JiraStagedAttachment = Readonly<{
  sourceAttachmentId: string
  ticketId: string
  filename: string
  contentType: string
  byteSize: number
  downloadUrl: string
  destinationUrl: string | null
  status: "pending"
}>

export type JiraStagedGroup = Readonly<{
  sourceGroupId: string
  kind: "sprint" | "epic" | "milestone"
  name: string
  body: string
  ticketIds: ReadonlyArray<string>
  startsAt: string | null
  endsAt: string | null
  completedAt: string | null
}>

export type JiraPublicationPlan = Readonly<{
  migrationId: string
  manifestVersion: 1
  visibility: "hidden"
  archivePath: string
  project: Readonly<{
    slug: string
    key: string
    name: string
    body: string
    jiraSourceUrl: string
  }>
  tags: ReadonlyArray<
    Readonly<{
      name: string
      sourceIds: ReadonlyArray<string>
    }>
  >
  createdStatuses: ReadonlyArray<
    Readonly<{
      slug: string
      label: string
      icon: "CircleDashed" | "CircleDot" | "CircleCheck"
      color: string
      isTerminal: false
    }>
  >
  tickets: ReadonlyArray<JiraStagedTicket>
  comments: ReadonlyArray<JiraStagedComment>
  attachments: ReadonlyArray<JiraStagedAttachment>
  groups: ReadonlyArray<JiraStagedGroup>
  atomicPublication: Readonly<{
    exposeProject: true
    publishIndexes: true
    markMigrationSucceeded: true
  }>
}>

export type JiraPublicationPlanResult =
  | Readonly<{
      kind: "blocked"
      blockers: ReadonlyArray<JiraPreflightFinding<JiraPreflightBlockerCode>>
    }>
  | Readonly<{ kind: "ready"; plan: JiraPublicationPlan }>

type JiraPublicationSource = JiraMappingSource &
  Pick<JiraMigrationManifest, "source" | "comments" | "migrationId"> &
  Readonly<{ version: 1 | 2 }>
type JiraPublicationDraftResult =
  | Readonly<{ kind: "blocked"; blockers: JiraPreflightResult["blockers"] }>
  | Readonly<{
      kind: "ready"
      plan: Omit<JiraPublicationPlan, "manifestVersion"> &
        Readonly<{ manifestVersion: 1 | 2 }>
    }>
export function createJiraPublicationPlan(
  manifest: JiraMigrationManifest,
  mappings: JiraMigrationMappings,
  preflight: JiraPreflightResult,
  attachmentUrlsBySourceId: Readonly<Record<string, string>>
): JiraPublicationPlanResult {
  const result = createJiraPublicationDraft(
    manifest,
    mappings,
    preflight,
    attachmentUrlsBySourceId
  )
  return result.kind === "blocked"
    ? result
    : { kind: "ready", plan: { ...result.plan, manifestVersion: 1 } }
}

export function createJiraReferenceTargets(
  manifest: JiraPublicationSource,
  mappings: JiraMigrationMappings,
  attachmentUrlsBySourceId: Readonly<Record<string, string>>
): JiraReferenceTargets {
  const targets: Record<string, JiraReferenceTarget> = {}
  const ticketMappings = new Map(
    mappings.ticketIds.map((mapping) => [mapping.sourceIssueId, mapping])
  )
  for (const issue of manifest.issues) {
    const mapping = ticketMappings.get(issue.id)
    if (!mapping) continue
    const target = {
      url: formatMentionHref("ticket", mapping.destinationTicketId),
      text: mapping.destinationTicketId
    }
    targets[jiraReferenceKey("jira-issue", issue.id)] = target
    targets[jiraReferenceKey("jira-issue", issue.key)] = target
  }
  for (const mapping of mappings.identities) {
    if (mapping.resolution.kind !== "link") continue
    targets[jiraReferenceKey("jira-user", mapping.sourceAccountId)] = {
      url: formatMentionHref("user", mapping.resolution.userId)
    }
  }
  const embeddableUrls = new Set(
    manifest.attachments
      .filter(isEmbeddableAttachment)
      .map((attachment) => attachmentUrlsBySourceId[attachment.id])
      .filter((url) => url !== undefined)
  )
  for (const [sourceAttachmentId, url] of Object.entries(
    attachmentUrlsBySourceId
  )) {
    targets[jiraReferenceKey("jira-attachment", sourceAttachmentId)] =
      embeddableUrls.has(url) ? { url, embed: true } : { url }
  }
  return targets
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i

const isEmbeddableAttachment = (attachment: JiraManifestAttachment): boolean =>
  attachment.mimeType.toLowerCase().startsWith("image/") ||
  IMAGE_EXTENSIONS.test(attachment.filename.trim())

export function rewriteJiraPublicationText(
  text: JiraConvertedText,
  targets: JiraReferenceTargets
): string {
  const destinations = new Map<string, JiraReferenceTarget>()
  for (const reference of text.references) {
    const target = targets[jiraReferenceKey(reference.kind, reference.sourceId)]
    if (target) destinations.set(reference.placeholder, target)
  }
  return rewriteJiraReferences(text, destinations)
}

function createJiraPublicationDraft(
  manifest: JiraPublicationSource,
  mappings: JiraMigrationMappings,
  preflight: JiraPreflightResult,
  attachmentUrlsBySourceId: Readonly<Record<string, string>>
): JiraPublicationDraftResult {
  if (!preflight.ready) return { kind: "blocked", blockers: preflight.blockers }

  const targets = createJiraReferenceTargets(
    manifest,
    mappings,
    attachmentUrlsBySourceId
  )
  const excluded = excludedSourceRecords(manifest, mappings)
  const ticketMappings = new Map(
    mappings.ticketIds.map((mapping) => [
      mapping.sourceIssueId,
      mapping.destinationTicketId
    ])
  )
  const statusMappings = new Map(
    mappings.statuses.map((mapping) => [
      mapping.sourceStatusId,
      mapping.destinationStatusSlug
    ])
  )
  const createOptions = new Map(
    buildJiraStatusCreateOptions(manifest.statuses).map((candidate) => [
      candidate.sourceStatusId,
      candidate.createOption
    ])
  )
  const createdBySlug = new Map<
    string,
    NonNullable<ReturnType<typeof createOptions.get>>
  >()
  for (const mapping of mappings.statuses.toSorted((left, right) =>
    compareStrings(left.sourceStatusId, right.sourceStatusId)
  )) {
    if (mapping.createStatus !== true) continue
    const option = createOptions.get(mapping.sourceStatusId)
    if (
      option !== null &&
      option !== undefined &&
      option.slug === mapping.destinationStatusSlug &&
      !createdBySlug.has(option.slug)
    ) {
      createdBySlug.set(option.slug, option)
    }
  }
  const createdStatuses = [...createdBySlug.values()].toSorted((left, right) =>
    compareStrings(left.slug, right.slug)
  )
  const typeMappings = new Map(
    mappings.issueTypes.map((mapping) => [
      mapping.sourceIssueTypeId,
      mapping.destinationType
    ])
  )
  const priorityMappings = new Map(
    mappings.priorities.map((mapping) => [
      priorityMappingKey(mapping.sourcePriorityId),
      mapping.destinationPriority
    ])
  )
  const identityMappings = new Map(
    mappings.identities.map((mapping) => [
      mapping.sourceAccountId,
      mapping.resolution
    ])
  )
  const tagCandidates = resolveTagDestinations(manifest, mappings)

  const tickets = manifest.issues
    .filter((issue) => !excluded.issues.has(issue.id))
    .map((issue): JiraStagedTicket => {
      const identity =
        issue.assigneeAccountId === null
          ? undefined
          : identityMappings.get(issue.assigneeAccountId)
      const tags = [
        ...issue.labels.map((label) => tagCandidates.get(`label:${label}`)),
        ...issue.componentIds.map((componentId) =>
          tagCandidates.get(`component:${componentId}`)
        )
      ].filter((tag): tag is string => tag !== null && tag !== undefined)
      return {
        sourceIssueId: issue.id,
        sourceIssueKey: issue.key,
        id: requireMapped(ticketMappings, issue.id),
        title: issue.summary,
        status: requireMapped(statusMappings, issue.statusId),
        type: requireMapped(typeMappings, issue.issueTypeId),
        priority: requireMapped(
          priorityMappings,
          priorityMappingKey(issue.priorityId)
        ),
        tags: [...new Set(tags)].toSorted(compareStrings),
        assignees: identity?.kind === "link" ? [identity.userId] : [],
        body:
          issue.description === null
            ? ""
            : rewriteJiraPublicationText(issue.description, targets),
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt
      }
    })
    .toSorted((left, right) => compareStrings(left.id, right.id))

  const comments = manifest.comments
    .filter(
      (comment) =>
        !excluded.comments.has(comment.id) &&
        !excluded.issues.has(comment.issueId)
    )
    .map((comment): JiraStagedComment => {
      const identity = identityMappings.get(comment.authorAccountId)
      return {
        sourceCommentId: comment.id,
        ticketId: requireMapped(ticketMappings, comment.issueId),
        author:
          identity?.kind === "link"
            ? { kind: "user", userId: identity.userId }
            : {
                kind: "jira",
                displayName: comment.authorDisplayName,
                accountId: comment.authorAccountId
              },
        body: rewriteJiraPublicationText(comment.body, targets),
        createdAt: comment.createdAt,
        editedAt: comment.updatedAt
      }
    })
    .toSorted((left, right) =>
      compareStrings(left.sourceCommentId, right.sourceCommentId)
    )

  const attachmentPreflight = new Map(
    preflight.attachments.map((attachment) => [
      attachment.sourceAttachmentId,
      attachment
    ])
  )
  const attachments = manifest.attachments
    .filter(
      (attachment) =>
        attachmentPreflight.get(attachment.id)?.action === "migrate" &&
        !excluded.issues.has(attachment.issueId) &&
        attachment.downloadUrl !== null
    )
    .map((attachment): JiraStagedAttachment => ({
      sourceAttachmentId: attachment.id,
      ticketId: requireMapped(ticketMappings, attachment.issueId),
      filename: attachment.filename,
      contentType: attachment.mimeType,
      byteSize: attachment.byteSize,
      downloadUrl: requireString(attachment.downloadUrl),
      destinationUrl: attachmentUrlsBySourceId[attachment.id] ?? null,
      status: "pending"
    }))
    .toSorted((left, right) =>
      compareStrings(left.sourceAttachmentId, right.sourceAttachmentId)
    )

  const openConflicts = new Map(
    buildOpenSprintConflicts(manifest).map((conflict) => [
      conflict.sourceIssueId,
      new Set(conflict.candidateGroupIds)
    ])
  )
  const sprintSelections = new Map(
    mappings.openSprintMemberships.map((mapping) => [
      mapping.sourceIssueId,
      mapping.selectedGroupId
    ])
  )
  const groups = manifest.groups
    .map((group): JiraStagedGroup => ({
      sourceGroupId: group.id,
      kind: group.kind,
      name: group.name,
      body: group.description ?? "",
      ticketIds: publicationGroupTicketIds(
        group,
        excluded.issues,
        ticketMappings,
        openConflicts,
        sprintSelections
      ),
      startsAt: group.startsAt,
      endsAt: group.endsAt,
      completedAt: group.completedAt
    }))
    .toSorted((left, right) =>
      compareStrings(left.sourceGroupId, right.sourceGroupId)
    )

  const groupedTags = new Map<string, Array<string>>()
  const includedTagSourceIds = new Set(
    manifest.issues
      .filter((issue) => !excluded.issues.has(issue.id))
      .flatMap((issue) =>
        issue.labels
          .map((label) => `label:${label}`)
          .concat(
            issue.componentIds.map((componentId) => `component:${componentId}`)
          )
      )
  )
  for (const [sourceId, destinationTag] of resolveTagDestinations(
    manifest,
    mappings
  )) {
    if (destinationTag === null || !includedTagSourceIds.has(sourceId)) continue
    const sources = groupedTags.get(destinationTag)
    if (sources) sources.push(sourceId)
    else groupedTags.set(destinationTag, [sourceId])
  }
  const tags = [...groupedTags]
    .map(([name, sourceIds]) => ({
      name,
      sourceIds: sourceIds.toSorted(compareStrings)
    }))
    .toSorted((left, right) => compareStrings(left.name, right.name))

  return {
    kind: "ready",
    plan: {
      migrationId: manifest.migrationId,
      manifestVersion: manifest.version,
      visibility: "hidden",
      archivePath: `imports/jira/${manifest.migrationId}`,
      project: {
        slug: mappings.project.slug,
        key: mappings.project.key,
        name: mappings.project.name,
        body:
          manifest.source.description === undefined ||
          manifest.source.description === null
            ? ""
            : rewriteJiraPublicationText(manifest.source.description, targets),
        jiraSourceUrl: `${manifest.source.siteUrl.replace(/\/$/, "")}/browse/${manifest.source.projectKey}`
      },
      tags,
      createdStatuses,
      tickets,
      comments,
      attachments,
      groups,
      atomicPublication: {
        exposeProject: true,
        publishIndexes: true,
        markMigrationSucceeded: true
      }
    }
  }
}

export function jiraReferenceKey(
  kind: "jira-issue" | "jira-attachment" | "jira-user",
  sourceId: string
): string {
  return `${kind}:${sourceId}`
}

function publicationGroupTicketIds(
  group: JiraManifestGroup,
  excludedIssueIds: ReadonlySet<string>,
  ticketMappings: ReadonlyMap<string, string>,
  openConflicts: ReadonlyMap<string, ReadonlySet<string>>,
  sprintSelections: ReadonlyMap<string, string | null>
): ReadonlyArray<string> {
  return group.issueIds
    .filter((issueId) => {
      if (excludedIssueIds.has(issueId)) return false
      if (group.kind !== "sprint" || group.state === "completed") return true
      const conflict = openConflicts.get(issueId)
      if (!conflict?.has(group.id)) return true
      return sprintSelections.get(issueId) === group.id
    })
    .map((issueId) => requireMapped(ticketMappings, issueId))
    .toSorted(compareStrings)
}

function excludedSourceRecords(
  manifest: JiraPublicationSource,
  mappings: JiraMigrationMappings
): Readonly<{ issues: Set<string>; comments: Set<string> }> {
  const decisions = new Map(
    mappings.restrictions.map((mapping) => [
      mapping.restrictionId,
      mapping.resolution
    ])
  )
  const issues = new Set<string>()
  const comments = new Set<string>()
  for (const restriction of manifest.restrictions) {
    if (decisions.get(restriction.id) !== "exclude") continue
    if (restriction.targetKind === "issue") issues.add(restriction.targetId)
    if (restriction.targetKind === "comment") comments.add(restriction.targetId)
  }
  return { issues, comments }
}

function requireMapped<K extends string, V>(
  mappings: ReadonlyMap<K, V>,
  key: K
): V {
  const value = mappings.get(key)
  if (value === undefined)
    throw new Error(`Missing approved mapping for ${key}`)
  return value
}

function requireString(value: string | null): string {
  if (value === null) throw new Error("Missing approved attachment source URL")
  return value
}

function priorityMappingKey(sourcePriorityId: string | null): string {
  return sourcePriorityId === null ? "priority:none" : sourcePriorityId
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

const Sha256 = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[a-f0-9]{64}$/))
)
const Timestamp = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d{4}-\d\d-\d\dT/))
)
const Count = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))
export const JiraResolvedConvertedText = Schema.Struct({
  ...ConvertedTextSchema.fields,
  adf: Schema.Json
})
export const JiraResolvedSource = Schema.Struct({
  projectDescription: Schema.NullOr(JiraResolvedConvertedText),
  artifacts: Schema.Array(
    Schema.Struct({ ref: JiraArtifactRef, value: Schema.Json })
  )
})
export const JiraPreparationInput = Schema.Struct({
  manifest: JiraMigrationManifestV2,
  manifestSha256: Sha256,
  configurationRevision: Count,
  configuration: JiraMigrationConfiguration,
  migrationCreatedAt: Timestamp,
  organizationId: Schema.NonEmptyString,
  orgSlug: Slug,
  ownerId: Schema.NonEmptyString,
  storageKeyPrefix: Schema.String,
  users: Schema.Array(
    Schema.Struct({
      userId: Schema.NonEmptyString,
      username: Schema.NonEmptyString
    })
  ),
  environment: JiraPreflightEnvironmentSchema,
  source: JiraResolvedSource
})
const PreparedAttachment = Schema.Struct({
  sourceAttachmentId: Schema.NonEmptyString,
  id: AttachmentId,
  issueId: Schema.NonEmptyString,
  ticketId: TicketId,
  objectKey: Schema.NonEmptyString,
  url: Schema.String,
  filename: Schema.NonEmptyString,
  contentType: Schema.String,
  byteSize: Count,
  decision: Schema.Literals(["copy", "skip", "exclude"])
})
export const JiraPreparedPublicationV1 = Schema.Struct({
  ...JiraPreparationInput.fields,
  version: Schema.Literal(1),
  projectId: Schema.String,
  attachments: Schema.Array(PreparedAttachment)
})
export type JiraPreparedPublicationV1 = typeof JiraPreparedPublicationV1.Type
export const JiraAttachmentOutcome = Schema.Union([
  Schema.Struct({
    sourceAttachmentId: Schema.NonEmptyString,
    kind: Schema.Literal("copied"),
    attachmentId: AttachmentId,
    objectKey: Schema.NonEmptyString,
    byteSize: Count,
    contentType: Schema.NonEmptyString,
    contentSha256: Sha256
  }),
  Schema.Struct({
    sourceAttachmentId: Schema.NonEmptyString,
    kind: Schema.Literals(["skipped", "excluded"])
  })
])
export type JiraAttachmentOutcome = typeof JiraAttachmentOutcome.Type

const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
export function jiraAttachmentId(
  migrationId: string,
  sourceAttachmentId: string,
  migrationCreatedAt: string
): AttachmentId {
  const seed = createHash("sha256")
    .update(JSON.stringify([migrationId, sourceAttachmentId]))
    .digest()
  let offset = 0
  return Schema.decodeUnknownSync(AttachmentId)(
    ulid(
      DateTime.toEpochMillis(DateTime.makeUnsafe(migrationCreatedAt)),
      () => seed[offset++ % seed.length]! / 256
    )
  )
}
export const jiraProjectIdFor = (migrationId: string) => {
  const hex = digest(JSON.stringify(["jira-project-v1", migrationId]))
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
const normalizeConfiguration = (
  configuration: JiraMigrationConfiguration
): JiraMigrationConfiguration => ({
  ...configuration,
  identities: configuration.identities.toSorted((a, b) =>
    compareStrings(a.jiraAccountId, b.jiraAccountId)
  ),
  statuses: configuration.statuses.toSorted((a, b) =>
    compareStrings(a.jiraStatusId, b.jiraStatusId)
  ),
  issueTypes: configuration.issueTypes.toSorted((a, b) =>
    compareStrings(a.jiraIssueTypeId, b.jiraIssueTypeId)
  ),
  priorities: configuration.priorities.toSorted((a, b) =>
    compareStrings(a.jiraPriorityId, b.jiraPriorityId)
  ),
  tags: configuration.tags.toSorted((a, b) =>
    compareStrings(
      `${a.source.kind}:${a.source.value}`,
      `${b.source.kind}:${b.source.value}`
    )
  ),
  activeFutureSprintChoices: configuration.activeFutureSprintChoices.toSorted(
    (a, b) => compareStrings(a.jiraIssueId, b.jiraIssueId)
  ),
  skippedAttachmentIds:
    configuration.skippedAttachmentIds.toSorted(compareStrings)
})
const requiredSourceRefs = (manifest: JiraMigrationManifestV2) => [
  ...manifest.rawArtifacts,
  ...manifest.issues.flatMap((x) =>
    x.descriptionArtifact === null ? [] : [x.descriptionArtifact]
  ),
  ...manifest.comments.map((x) => x.bodyArtifact),
  ...manifest.worklogs.flatMap((x) =>
    x.bodyArtifact === null ? [] : [x.bodyArtifact]
  ),
  ...manifest.attachments.map((x) => x.metadataArtifact),
  ...manifest.customFields.map((x) => x.valuesArtifact)
]
const sourceValues = (prepared: typeof JiraPreparationInput.Type) =>
  new Map(prepared.source.artifacts.map((x) => [x.ref.key, x.value]))
const sourceText = (
  values: ReadonlyMap<string, Schema.Json>,
  ref: JiraArtifactRef | null
) =>
  ref === null
    ? null
    : Schema.decodeUnknownSync(JiraResolvedConvertedText)(values.get(ref.key))

export const prepareJiraPublication = Effect.fn("prepareJiraPublication")(
  function* (raw: unknown) {
    const input = yield* Schema.decodeUnknownEffect(JiraPreparationInput)(
      raw
    ).pipe(
      Effect.mapError(
        () =>
          new JiraPublicationInvalid({
            reasons: ["invalid-configuration-or-source-schema"]
          })
      )
    )
    yield* validatePublicationSource(input)
    const checked = yield* preflightJiraMigrationV2(input)
    const reasons = checked.blockers.map((x) => `${x.code}:${x.subjectId}`)
    const refs = new Map(
      requiredSourceRefs(input.manifest).map((ref) => [ref.key, ref])
    )
    const seen = new Set<string>()
    for (const artifact of input.source.artifacts) {
      if (seen.has(artifact.ref.key))
        reasons.push(`duplicate-source-artifact:${artifact.ref.key}`)
      seen.add(artifact.ref.key)
      const expected = refs.get(artifact.ref.key)
      if (
        !expected ||
        canonicalJiraJson(expected) !== canonicalJiraJson(artifact.ref)
      )
        reasons.push(
          `foreign-or-mismatched-source-artifact:${artifact.ref.key}`
        )
    }
    for (const ref of refs.values())
      if (!seen.has(ref.key)) reasons.push(`missing-source-artifact:${ref.key}`)
    const users = new Map(input.users.map((user) => [user.userId, user]))
    if (
      users.size !== input.users.length ||
      new Set(input.users.map((user) => user.username)).size !==
        input.users.length
    )
      reasons.push("duplicate-member-identity")
    for (const id of [
      input.ownerId,
      ...input.configuration.identities.flatMap((x) =>
        x.projectProjectUserId === null ? [] : [x.projectProjectUserId]
      )
    ])
      if (!users.has(id)) reasons.push(`missing-member-identity:${id}`)
    if (reasons.length > 0)
      return yield* new JiraPublicationInvalid({
        reasons: reasons.toSorted(compareStrings)
      })
    for (const ref of [
      ...input.manifest.issues.flatMap((x) =>
        x.descriptionArtifact === null ? [] : [x.descriptionArtifact]
      ),
      ...input.manifest.comments.map((x) => x.bodyArtifact)
    ])
      yield* Schema.decodeUnknownEffect(JiraResolvedConvertedText)(
        sourceValues(input).get(ref.key)
      ).pipe(
        Effect.mapError(
          () =>
            new JiraPublicationInvalid({
              reasons: [`invalid-converted-text:${ref.key}`]
            })
        )
      )
    const excluded = new Set(
      jiraRestrictionPolicy(input.configuration) === "exclude"
        ? input.manifest.restrictions
            .filter((x) => x.targetKind === "issue")
            .map((x) => x.targetId)
        : []
    )
    const attachments = input.manifest.attachments
      .map((attachment) => {
        const id = jiraAttachmentId(
          input.manifest.migrationId,
          attachment.id,
          input.migrationCreatedAt
        )
        const ticketId = input.manifest.issues.find(
          (issue) => issue.id === attachment.issueId
        )!.key
        return {
          sourceAttachmentId: attachment.id,
          id,
          issueId: attachment.issueId,
          ticketId,
          filename: attachment.filename,
          contentType: attachment.mimeType,
          byteSize: attachment.byteSize,
          objectKey: attachmentObjectKey({
            keyPrefix: input.storageKeyPrefix,
            orgSlug: input.orgSlug,
            projectSlug: input.configuration.destination.slug,
            ticketId,
            attachmentId: id,
            filename: attachment.filename
          }),
          url: attachmentUrl(input.orgSlug, id),
          decision: excluded.has(attachment.issueId)
            ? "exclude"
            : input.configuration.skippedAttachmentIds.includes(attachment.id)
              ? "skip"
              : "copy"
        }
      })
      .toSorted((a, b) =>
        compareStrings(a.sourceAttachmentId, b.sourceAttachmentId)
      )
    const prepared = yield* Schema.decodeUnknownEffect(
      JiraPreparedPublicationV1
    )({
      ...input,
      manifest: normalizeJiraMigrationManifestV2(input.manifest),
      configuration: normalizeConfiguration(input.configuration),
      users: input.users.toSorted((a, b) => compareStrings(a.userId, b.userId)),
      source: {
        ...input.source,
        artifacts: input.source.artifacts.toSorted((a, b) =>
          compareStrings(a.ref.key, b.ref.key)
        )
      },
      version: 1,
      projectId: jiraProjectIdFor(input.manifest.migrationId),
      attachments
    })
    return freezeJiraValue(structuredClone(prepared))
  }
)

const PlannedProject = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  orgSlug: Slug,
  slug: Slug,
  key: ProjectKey,
  name: Schema.String,
  icon: Schema.String,
  color: Schema.String,
  createdBy: Schema.String,
  createdAt: Timestamp,
  body: Schema.String
})
const PlannedMember = Schema.Struct({
  userId: Schema.String,
  username: Schema.String,
  role: Schema.Literals(["owner", "member"])
})
const PlannedStatus = Schema.Struct({
  slug: StatusSlug,
  label: Schema.String,
  icon: Schema.String,
  color: Schema.String,
  isTerminal: Schema.Literal(false),
  orderKey: Schema.String
})
const PlannedTag = Schema.Struct({
  name: TagName,
  color: Schema.String,
  sourceIds: Schema.Array(Schema.String)
})
const PlannedTicket = Schema.Struct({
  sourceIssueId: Schema.String,
  sourceIssueKey: Schema.String,
  id: TicketId,
  title: Schema.String,
  status: StatusSlug,
  type: TicketType,
  priority: TicketPriority,
  tags: Schema.Array(TagName),
  assignees: Schema.Array(Schema.String),
  body: Schema.String,
  createdAt: Timestamp,
  updatedAt: Timestamp
})
const PlannedComment = Schema.Struct({
  id: Schema.String,
  sourceCommentId: Schema.String,
  ticketId: TicketId,
  author: Schema.Union([
    Schema.Struct({ kind: Schema.Literal("user"), userId: Schema.String }),
    Schema.Struct({
      kind: Schema.Literal("jira"),
      accountId: Schema.String,
      displayName: Schema.String
    })
  ]),
  body: Schema.String,
  createdAt: Timestamp,
  editedAt: Schema.NullOr(Timestamp)
})
const PlannedGroup = Schema.Struct({
  id: GroupId,
  sourceGroupId: Schema.String,
  kind: Schema.Literal("sprint"),
  name: Schema.String,
  body: Schema.String,
  ticketIds: Schema.Array(TicketId),
  color: Schema.String,
  startsAt: Schema.NullOr(Timestamp),
  endsAt: Schema.NullOr(Timestamp),
  completedAt: Schema.NullOr(Timestamp)
})
const PlannedDocument = Schema.Struct({
  path: Schema.String,
  content: Schema.String,
  sha256: Sha256
})
const ProjectRow = Schema.Struct({
  id: Schema.String,
  organizationId: Schema.String,
  slug: Slug,
  key: ProjectKey,
  name: Schema.String,
  icon: Schema.String,
  color: Schema.String,
  banner: Schema.Null,
  iconImage: Schema.Null,
  nextTicketNumber: Count,
  createdBy: Schema.String,
  createdAt: Timestamp,
  publishedAt: Schema.Null
})
const TicketRow = Schema.Struct({
  organizationId: Schema.String,
  orgSlug: Slug,
  projectId: Schema.String,
  projectSlug: Slug,
  ticketId: TicketId,
  title: Schema.String,
  status: StatusSlug,
  type: TicketType,
  priority: TicketPriority,
  tags: Schema.Array(TagName),
  assignees: Schema.Array(Schema.String),
  branch: Schema.Null,
  pr: Schema.Null,
  prState: Schema.Null,
  lastTransitionedPr: Schema.Null,
  archivedAt: Schema.Null,
  createdBy: Schema.String,
  createdAt: Timestamp,
  updatedAt: Timestamp
})
const CommentRow = Schema.Struct({
  id: Schema.String,
  projectSlug: Slug,
  ticketId: TicketId,
  origin: Schema.Literal("jira"),
  authorKind: Schema.Literals(["user", "jira"]),
  authorId: Schema.NullOr(Schema.String),
  jiraDisplayName: Schema.NullOr(Schema.String),
  jiraAccountId: Schema.NullOr(Schema.String),
  createdAt: Timestamp,
  editedAt: Schema.NullOr(Timestamp)
})
const AttachmentRow = Schema.Struct({
  id: AttachmentId,
  organizationId: Schema.String,
  orgSlug: Slug,
  projectSlug: Slug,
  ticketId: TicketId,
  objectKey: Schema.String,
  filename: Schema.String,
  contentType: Schema.String,
  byteSize: Count,
  contentHash: Sha256,
  status: Schema.Literal("live"),
  uploadedBy: Schema.String,
  createdAt: Timestamp,
  committedAt: Timestamp,
  orphanedAt: Schema.Null
})
const AttachmentReferenceRow = Schema.Struct({
  attachmentId: AttachmentId,
  orgSlug: Slug,
  projectSlug: Slug,
  ticketId: TicketId,
  createdAt: Timestamp
})
const StatusRow = Schema.Struct({
  projectId: Schema.String,
  slug: StatusSlug,
  label: Schema.String,
  icon: Schema.String,
  color: Schema.String,
  orderKey: Schema.String,
  createdBy: Schema.String,
  createdAt: Timestamp
})
const TagRow = Schema.Struct({
  projectId: Schema.String,
  name: TagName,
  color: Schema.String,
  createdBy: Schema.String,
  createdAt: Timestamp
})
const MemberRow = Schema.Struct({
  projectId: Schema.String,
  projectSlug: Slug,
  userId: Schema.String,
  role: Schema.Literals(["owner", "member"]),
  createdAt: Timestamp
})
export const JiraPublicationPlanV1 = Schema.Struct({
  version: Schema.Literal(1),
  manifestVersion: Schema.Literal(2),
  migrationId: Schema.NonEmptyString,
  project: PlannedProject,
  members: Schema.Array(PlannedMember),
  statuses: Schema.Array(PlannedStatus),
  tags: Schema.Array(PlannedTag),
  groups: Schema.Array(PlannedGroup),
  tickets: Schema.Array(PlannedTicket),
  comments: Schema.Array(PlannedComment),
  attachments: Schema.Array(JiraAttachmentOutcome),
  documents: Schema.Array(PlannedDocument),
  maps: Schema.Struct({
    issues: Schema.Array(
      Schema.Struct({ sourceId: Schema.String, targetId: TicketId })
    ),
    comments: Schema.Array(
      Schema.Struct({ sourceId: Schema.String, targetId: Schema.String })
    ),
    groups: Schema.Array(
      Schema.Struct({ sourceId: Schema.String, targetId: GroupId })
    ),
    attachments: Schema.Array(
      Schema.Struct({ sourceId: Schema.String, targetId: AttachmentId })
    )
  }),
  indexes: Schema.Struct({
    project: ProjectRow,
    tickets: Schema.Array(TicketRow),
    comments: Schema.Array(CommentRow),
    attachments: Schema.Array(AttachmentRow),
    attachmentReferences: Schema.Array(AttachmentReferenceRow),
    statuses: Schema.Array(StatusRow),
    tags: Schema.Array(TagRow),
    members: Schema.Array(MemberRow)
  }),
  archive: JiraPlannedArchive,
  report: JiraPlannedReport,
  archiveDocument: PlannedDocument,
  reportDocument: PlannedDocument
})
export type JiraPublicationPlanV1 = typeof JiraPublicationPlanV1.Type
const documentFor = (path: string, content: string) => ({
  path,
  content,
  sha256: digest(content)
})
const markdownDocument = (
  path: string,
  frontmatter: Schema.Json,
  body: string
) => documentFor(path, `---\n${canonicalJiraJson(frontmatter)}\n---\n${body}`)

export const finalizeJiraPublication = Effect.fn("finalizeJiraPublication")(
  function* (rawPrepared: unknown, rawOutcomes: unknown) {
    const prepared = yield* Schema.decodeUnknownEffect(
      JiraPreparedPublicationV1
    )(rawPrepared)
    const rebuilt = yield* prepareJiraPublication(prepared)
    if (
      canonicalJiraJson(
        (yield* Schema.encodeEffect(JiraPreparedPublicationV1)(
          rebuilt
        )) as Schema.Json
      ) !==
      canonicalJiraJson(
        (yield* Schema.encodeEffect(JiraPreparedPublicationV1)(
          prepared
        )) as Schema.Json
      )
    )
      return yield* new JiraPublicationInvalid({
        reasons: ["contradictory-preparation"]
      })
    const outcomes = (yield* Schema.decodeUnknownEffect(
      Schema.Array(JiraAttachmentOutcome)
    )(rawOutcomes)).toSorted((a, b) =>
      compareStrings(a.sourceAttachmentId, b.sourceAttachmentId)
    )
    const seen = new Set<string>()
    const reasons: Array<string> = []
    for (const outcome of outcomes) {
      if (seen.has(outcome.sourceAttachmentId))
        reasons.push("duplicate-attachment-outcome")
      seen.add(outcome.sourceAttachmentId)
      const expected = prepared.attachments.find(
        (x) => x.sourceAttachmentId === outcome.sourceAttachmentId
      )
      if (!expected) {
        reasons.push("foreign-attachment-outcome")
        continue
      }
      if (outcome.kind === "skipped" && expected.decision !== "skip")
        reasons.push("unaccepted-attachment-skip")
      else if (outcome.kind === "excluded" && expected.decision !== "exclude")
        reasons.push("contradictory-attachment-outcome")
      else if (
        outcome.kind === "copied" &&
        (expected.decision !== "copy" ||
          outcome.attachmentId !== expected.id ||
          outcome.objectKey !== expected.objectKey ||
          outcome.byteSize !== expected.byteSize ||
          outcome.contentType !== expected.contentType)
      )
        reasons.push("contradictory-attachment-outcome")
    }
    for (const attachment of prepared.attachments)
      if (!seen.has(attachment.sourceAttachmentId))
        reasons.push("missing-attachment-outcome")
    if (reasons.length > 0)
      return yield* new JiraPublicationInvalid({
        reasons: [...new Set(reasons)].toSorted(compareStrings)
      })
    const check = yield* preflightJiraMigrationV2(prepared)
    const values = sourceValues(prepared)
    const manifest = prepared.manifest
    const excludedIssues = new Set(
      jiraRestrictionPolicy(prepared.configuration) === "exclude"
        ? manifest.restrictions
            .filter((x) => x.targetKind === "issue")
            .map((x) => x.targetId)
        : []
    )
    const source: JiraPublicationSource = {
      ...check.source,
      version: 2,
      migrationId: manifest.migrationId,
      source: {
        ...manifest.source,
        productType: null,
        description: prepared.source.projectDescription
      },
      issues: check.source.issues.map((issue) => ({
        ...issue,
        description: sourceText(
          values,
          manifest.issues.find((x) => x.id === issue.id)!.descriptionArtifact
        )
      })),
      comments: manifest.comments.map((comment) => ({
        ...comment,
        body: sourceText(values, comment.bodyArtifact)!,
        authorDisplayName:
          manifest.identities.find(
            (x) => x.accountId === comment.authorAccountId
          )?.displayName ?? comment.authorAccountId,
        raw: null
      }))
    }
    const urls = Object.fromEntries(
      prepared.attachments
        .filter((x) => x.decision === "copy")
        .map((x) => [x.sourceAttachmentId, x.url])
    )
    const safeMappings = {
      ...check.mappings,
      ticketIds: check.mappings.ticketIds.filter(
        (x) => !excludedIssues.has(x.sourceIssueId)
      )
    }
    const draft = createJiraPublicationDraft(source, safeMappings, check, urls)
    if (draft.kind === "blocked")
      return yield* new JiraPublicationInvalid({
        reasons: draft.blockers.map((x) => x.code)
      })
    const identity = deriveProjectIdentity(
      prepared.configuration.destination.slug
    )
    const project = {
      ...prepared.configuration.destination,
      id: prepared.projectId,
      organizationId: prepared.organizationId,
      orgSlug: prepared.orgSlug,
      ...identity,
      createdBy: prepared.ownerId,
      createdAt: prepared.migrationCreatedAt,
      body: draft.plan.project.body
    }
    const members = prepared.users
      .filter(
        (user) =>
          user.userId === prepared.ownerId ||
          prepared.configuration.identities.some(
            (x) => x.projectProjectUserId === user.userId
          )
      )
      .map((user) => ({
        ...user,
        role: user.userId === prepared.ownerId ? "owner" : "member"
      }))
    let orderKey: string = BASELINE_STATUS_SEED.at(-1)!.orderKey
    const statuses = draft.plan.createdStatuses.map((status) => {
      orderKey = generateKeyBetween(orderKey, null)
      return { ...status, orderKey }
    })
    const usedColors: Array<string> = []
    const tags = draft.plan.tags.map((tag) => {
      const color = pickStatusColor(usedColors)
      usedColors.push(color)
      return { ...tag, color }
    })
    const groups = draft.plan.groups.map((group, index) => ({
      ...group,
      id: `G-${index + 1}`,
      color: "#777777"
    }))
    const tickets = draft.plan.tickets
    const comments = draft.plan.comments.map((comment) => ({
      ...comment,
      id: `c_jira_${digest(JSON.stringify([manifest.migrationId, comment.sourceCommentId])).slice(0, 32)}`
    }))
    const documents = [
      markdownDocument(
        "project.md",
        {
          org: prepared.orgSlug,
          slug: project.slug,
          key: project.key,
          name: project.name,
          icon: identity.icon,
          color: identity.color,
          createdBy: prepared.ownerId,
          createdAt: project.createdAt,
          members: members.map(({ username, role }) => ({ username, role })),
          setup: {
            workflowReviewedAt: null,
            invitePeopleDismissedAt: null,
            connectGithubDismissedAt: null
          }
        },
        project.body || `# ${project.name}\n`
      ),
      ...tickets.map((ticket) => {
        const region = serializeCommentsRegion(
          comments
            .filter((comment) => comment.ticketId === ticket.id)
            .map((comment) => ({
              id: comment.id,
              author: comment.author,
              origin: "jira",
              createdAt: DateTime.toDate(
                DateTime.makeUnsafe(comment.createdAt)
              ),
              editedAt:
                comment.editedAt === null
                  ? null
                  : DateTime.toDate(DateTime.makeUnsafe(comment.editedAt)),
              body: comment.body
            }))
        )
        return markdownDocument(
          `tickets/${ticket.id}.md`,
          {
            id: ticket.id,
            title: ticket.title,
            status: ticket.status,
            type: ticket.type,
            priority: ticket.priority,
            tags: ticket.tags,
            assignees: ticket.assignees,
            branch: null,
            pr: null,
            prState: null,
            lastTransitionedPr: null,
            archivedAt: null,
            createdBy: prepared.ownerId,
            updatedBy: prepared.ownerId,
            createdAt: ticket.createdAt,
            updatedAt: ticket.updatedAt
          },
          region ? `${ticket.body.trimEnd()}\n\n${region}` : ticket.body
        )
      }),
      ...groups.map((group) =>
        markdownDocument(
          `groups/${group.id}.md`,
          {
            id: group.id,
            kind: group.kind,
            name: group.name,
            tickets: group.ticketIds,
            color: group.color,
            startsAt: group.startsAt,
            endsAt: group.endsAt,
            completedAt: group.completedAt,
            createdBy: prepared.ownerId,
            createdAt: project.createdAt,
            updatedAt: project.createdAt
          },
          group.body
        )
      )
    ].toSorted((a, b) => compareStrings(a.path, b.path))
    const commonRow = {
      projectId: project.id,
      createdBy: prepared.ownerId,
      createdAt: project.createdAt
    }
    const attachments = outcomes.flatMap((outcome) => {
      if (outcome.kind !== "copied") return []
      const attachment = prepared.attachments.find(
        (x) => x.sourceAttachmentId === outcome.sourceAttachmentId
      )!
      return [
        {
          id: attachment.id,
          organizationId: prepared.organizationId,
          orgSlug: prepared.orgSlug,
          projectSlug: project.slug,
          ticketId: attachment.ticketId,
          objectKey: attachment.objectKey,
          filename: attachment.filename,
          contentType: outcome.contentType,
          byteSize: outcome.byteSize,
          contentHash: outcome.contentSha256,
          status: "live",
          uploadedBy: prepared.ownerId,
          createdAt: project.createdAt,
          committedAt: project.createdAt,
          orphanedAt: null
        }
      ]
    })
    const archive = buildJiraArchiveV2(prepared, outcomes)
    const report = buildJiraReportV2(archive, {
      tickets: tickets.length,
      comments: comments.length,
      groups: groups.length,
      tags: tags.length,
      statuses: statuses.length,
      attachments: attachments.length,
      members: members.length
    })
    const plan = yield* Schema.decodeUnknownEffect(JiraPublicationPlanV1)({
      version: 1,
      manifestVersion: 2,
      migrationId: manifest.migrationId,
      project,
      members,
      statuses,
      tags,
      groups,
      tickets,
      comments,
      attachments: outcomes,
      documents,
      maps: {
        issues: tickets.map((x) => ({
          sourceId: x.sourceIssueId,
          targetId: x.id
        })),
        comments: comments.map((x) => ({
          sourceId: x.sourceCommentId,
          targetId: x.id
        })),
        groups: groups.map((x) => ({
          sourceId: x.sourceGroupId,
          targetId: x.id
        })),
        attachments: prepared.attachments
          .filter((x) => x.decision === "copy")
          .map((x) => ({ sourceId: x.sourceAttachmentId, targetId: x.id }))
      },
      indexes: {
        project: {
          id: project.id,
          organizationId: prepared.organizationId,
          slug: project.slug,
          key: project.key,
          name: project.name,
          icon: identity.icon,
          color: identity.color,
          banner: null,
          iconImage: null,
          nextTicketNumber:
            Math.max(0, ...manifest.issues.map((x) => x.issueNumber)) + 1,
          createdBy: prepared.ownerId,
          createdAt: project.createdAt,
          publishedAt: null
        },
        tickets: tickets.map((ticket) => ({
          organizationId: prepared.organizationId,
          orgSlug: prepared.orgSlug,
          projectId: project.id,
          projectSlug: project.slug,
          ticketId: ticket.id,
          title: ticket.title,
          status: ticket.status,
          type: ticket.type,
          priority: ticket.priority,
          tags: ticket.tags,
          assignees: ticket.assignees,
          branch: null,
          pr: null,
          prState: null,
          lastTransitionedPr: null,
          archivedAt: null,
          createdBy: prepared.ownerId,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt
        })),
        comments: comments.map((comment) => ({
          id: comment.id,
          projectSlug: project.slug,
          ticketId: comment.ticketId,
          origin: "jira",
          authorKind: comment.author.kind,
          authorId:
            comment.author.kind === "user" ? comment.author.userId : null,
          jiraDisplayName:
            comment.author.kind === "jira" ? comment.author.displayName : null,
          jiraAccountId:
            comment.author.kind === "jira" ? comment.author.accountId : null,
          createdAt: comment.createdAt,
          editedAt: comment.editedAt
        })),
        attachments,
        attachmentReferences: tickets.flatMap((ticket) => {
          const body = [
            ticket.body,
            ...comments
              .filter((comment) => comment.ticketId === ticket.id)
              .map((comment) => comment.body)
          ].join("\n")
          return [
            ...new Set(
              extractAttachmentRefs(body)
                .filter(
                  (ref) =>
                    ref.orgSlug === prepared.orgSlug &&
                    attachments.some((attachment) => attachment.id === ref.id)
                )
                .map((ref) => ref.id)
            )
          ]
            .toSorted(compareStrings)
            .map((attachmentId) => ({
              attachmentId,
              orgSlug: prepared.orgSlug,
              projectSlug: project.slug,
              ticketId: ticket.id,
              createdAt: project.createdAt
            }))
        }),
        statuses: [...BASELINE_STATUS_SEED, ...statuses].map((status) => ({
          ...commonRow,
          slug: status.slug,
          label: status.label,
          icon: status.icon,
          color: status.color,
          orderKey: status.orderKey
        })),
        tags: tags.map((tag) => ({
          ...commonRow,
          name: tag.name,
          color: tag.color
        })),
        members: members.map((member) => ({
          projectId: project.id,
          projectSlug: project.slug,
          userId: member.userId,
          role: member.role,
          createdAt: project.createdAt
        }))
      },
      archive,
      report,
      archiveDocument: documentFor(
        `imports/jira/${manifest.migrationId}/archive.json`,
        canonicalJiraJson(archive)
      ),
      reportDocument: documentFor(
        `imports/jira/${manifest.migrationId}/report.md`,
        report.markdown
      )
    })
    const bytes = new TextEncoder().encode(
      canonicalJiraJson(
        (yield* Schema.encodeEffect(JiraPublicationPlanV1)(plan)) as Schema.Json
      )
    )
    return {
      plan: freezeJiraValue(structuredClone(plan)),
      bytes,
      publicationRevision: createHash("sha256").update(bytes).digest("hex")
    }
  }
)

const freezeJiraValue = <A>(value: A): A => {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeJiraValue(child)
    Object.freeze(value)
  }
  return value
}
const CustomFieldValuesSchema = Schema.Array(
  Schema.Struct({ issueId: Schema.NonEmptyString, value: Schema.Json })
)
const validatePublicationSource = Effect.fn("validatePublicationSource")(
  function* (input: typeof JiraPreparationInput.Type) {
    const manifest = input.manifest
    const reasons: Array<string> = []
    const collections = [
      manifest.fieldDefinitions,
      manifest.workflows,
      manifest.statuses,
      manifest.issueTypes,
      manifest.priorities,
      manifest.components,
      manifest.issues,
      manifest.comments,
      manifest.changelogs,
      manifest.worklogs,
      manifest.watchers,
      manifest.votes,
      manifest.attachments,
      manifest.parentsSubtasks,
      manifest.epics,
      manifest.sprints,
      manifest.versionsReleases,
      manifest.ranks,
      manifest.links,
      manifest.restrictions,
      manifest.productApps,
      manifest.customFields,
      manifest.warnings
    ]
    for (const collection of collections)
      if (new Set(collection.map((x) => x.id)).size !== collection.length)
        reasons.push("duplicate-source-id")
    const issueIds = new Set(manifest.issues.map((x) => x.id))
    const accountIds = new Set(manifest.identities.map((x) => x.accountId))
    const owned = [
      ...manifest.comments,
      ...manifest.worklogs,
      ...manifest.changelogs,
      ...manifest.watchers,
      ...manifest.votes,
      ...manifest.attachments,
      ...manifest.ranks
    ]
    for (const record of owned)
      if (!issueIds.has(record.issueId))
        reasons.push("invalid-source-reference")
    for (const issue of manifest.issues)
      if (
        !manifest.statuses.some((x) => x.id === issue.statusId) ||
        !manifest.issueTypes.some((x) => x.id === issue.issueTypeId) ||
        (issue.priorityId !== null &&
          !manifest.priorities.some((x) => x.id === issue.priorityId)) ||
        issue.componentIds.some(
          (id) => !manifest.components.some((x) => x.id === id)
        ) ||
        [issue.assigneeAccountId, issue.reporterAccountId].some(
          (id) => id !== null && !accountIds.has(id)
        )
      )
        reasons.push("invalid-source-reference")
    for (const record of [
      ...manifest.comments,
      ...manifest.worklogs,
      ...manifest.changelogs
    ])
      if (
        record.authorAccountId !== null &&
        !accountIds.has(record.authorAccountId)
      )
        reasons.push("invalid-source-reference")
    for (const record of [...manifest.watchers, ...manifest.votes])
      if (!accountIds.has(record.accountId))
        reasons.push("invalid-source-reference")
    for (const group of [
      ...manifest.sprints,
      ...manifest.epics,
      ...manifest.versionsReleases
    ])
      if (group.issueIds.some((id) => !issueIds.has(id)))
        reasons.push("invalid-source-reference")
    for (const relation of manifest.parentsSubtasks)
      if (
        !issueIds.has(relation.parentIssueId) ||
        !manifest.issues.some(
          (issue) =>
            issue.id === relation.subtaskIssueId &&
            manifest.issueTypes.some(
              (type) => type.id === issue.issueTypeId && type.subtask
            )
        )
      )
        reasons.push("invalid-source-reference")
    for (const workflow of manifest.workflows)
      if (
        workflow.statusIds.some(
          (id) => !manifest.statuses.some((x) => x.id === id)
        )
      )
        reasons.push("invalid-source-reference")
    for (const restriction of manifest.restrictions)
      if (
        !(
          restriction.targetKind === "issue"
            ? manifest.issues
            : restriction.targetKind === "comment"
              ? manifest.comments
              : manifest.worklogs
        ).some((x) => x.id === restriction.targetId)
      )
        reasons.push("invalid-source-reference")
    for (const [kind, records] of [
      ["comment", manifest.comments],
      ["worklog", manifest.worklogs]
    ] as const)
      for (const record of records)
        if (
          record.restricted &&
          !manifest.restrictions.some(
            (x) => x.targetKind === kind && x.targetId === record.id
          )
        )
          reasons.push("missing-restriction-metadata")
    const timestamps = [
      input.migrationCreatedAt,
      manifest.source.scannedAt,
      ...manifest.issues.flatMap((x) => [x.createdAt, x.updatedAt]),
      ...manifest.comments.flatMap((x) => [x.createdAt, x.updatedAt]),
      ...manifest.worklogs.map((x) => x.startedAt),
      ...manifest.changelogs.map((x) => x.createdAt),
      ...manifest.sprints.flatMap((x) => [x.startsAt, x.endsAt])
    ].filter((x) => x !== null)
    for (const timestamp of timestamps)
      yield* Schema.decodeUnknownEffect(Schema.DateTimeUtcFromString)(
        timestamp
      ).pipe(
        Effect.mapError(
          () =>
            new JiraPublicationInvalid({
              reasons: ["invalid-source-timestamp"]
            })
        )
      )
    const values = sourceValues(input)
    for (const field of manifest.customFields) {
      const rows = yield* Schema.decodeUnknownEffect(CustomFieldValuesSchema)(
        values.get(field.valuesArtifact.key)
      ).pipe(
        Effect.mapError(
          () =>
            new JiraPublicationInvalid({
              reasons: ["invalid-custom-field-values"]
            })
        )
      )
      if (
        new Set(rows.map((x) => x.issueId)).size !== rows.length ||
        rows.some((x) => !issueIds.has(x.issueId))
      )
        reasons.push("invalid-source-reference")
    }
    if (reasons.length > 0)
      return yield* new JiraPublicationInvalid({
        reasons: [...new Set(reasons)].toSorted(compareStrings)
      })
    return undefined
  }
)
