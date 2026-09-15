import { formatMentionHref } from "@projectproject/shared"
import { rewriteJiraReferences } from "./Adf"
import type {
  JiraConvertedText,
  JiraManifestGroup,
  JiraMigrationManifest
} from "./Manifest"
import {
  buildOpenSprintConflicts,
  buildJiraStatusCreateOptions,
  buildTagCandidates,
  type JiraMigrationMappings
} from "./Mappings"
import type {
  JiraPreflightFinding,
  JiraPreflightBlockerCode,
  JiraPreflightResult
} from "./Preflight"

export type JiraReferenceTarget = {
  readonly url: string
  readonly text?: string
}

export type JiraReferenceTargets = Readonly<Record<string, JiraReferenceTarget>>

export type JiraStagedTicket = {
  readonly sourceIssueId: string
  readonly sourceIssueKey: string
  readonly id: string
  readonly title: string
  readonly status: string
  readonly type: "feat" | "bug" | "chore" | "other"
  readonly priority: "low" | "med" | "high"
  readonly tags: ReadonlyArray<string>
  readonly assignees: ReadonlyArray<string>
  readonly body: string
  readonly createdAt: string
  readonly updatedAt: string
}

export type JiraStagedComment = {
  readonly sourceCommentId: string
  readonly ticketId: string
  readonly author:
    | { readonly kind: "user"; readonly userId: string }
    | {
        readonly kind: "jira"
        readonly displayName: string
        readonly accountId: string
      }
  readonly body: string
  readonly createdAt: string
  readonly editedAt: string | null
}

export type JiraStagedAttachment = {
  readonly sourceAttachmentId: string
  readonly ticketId: string
  readonly filename: string
  readonly contentType: string
  readonly byteSize: number
  readonly downloadUrl: string
  readonly destinationUrl: string | null
  readonly status: "pending"
}

export type JiraStagedGroup = {
  readonly sourceGroupId: string
  readonly kind: "sprint" | "epic" | "milestone"
  readonly name: string
  readonly body: string
  readonly ticketIds: ReadonlyArray<string>
  readonly startsAt: string | null
  readonly endsAt: string | null
  readonly completedAt: string | null
}

export type JiraPublicationPlan = {
  readonly migrationId: string
  readonly manifestVersion: 1
  readonly visibility: "hidden"
  readonly archivePath: string
  readonly project: {
    readonly slug: string
    readonly key: string
    readonly name: string
    readonly body: string
    readonly jiraSourceUrl: string
  }
  readonly tags: ReadonlyArray<{
    readonly name: string
    readonly sourceIds: ReadonlyArray<string>
  }>
  readonly createdStatuses: ReadonlyArray<{
    readonly slug: string
    readonly label: string
    readonly icon: "CircleDashed" | "CircleDot" | "CircleCheck"
    readonly color: "#a3a3a3" | "#3b82f6" | "#22c55e"
    readonly isTerminal: false
  }>
  readonly tickets: ReadonlyArray<JiraStagedTicket>
  readonly comments: ReadonlyArray<JiraStagedComment>
  readonly attachments: ReadonlyArray<JiraStagedAttachment>
  readonly groups: ReadonlyArray<JiraStagedGroup>
  readonly atomicPublication: {
    readonly exposeProject: true
    readonly publishIndexes: true
    readonly markMigrationSucceeded: true
  }
}

export type JiraPublicationPlanResult =
  | {
      readonly kind: "blocked"
      readonly blockers: ReadonlyArray<
        JiraPreflightFinding<JiraPreflightBlockerCode>
      >
    }
  | { readonly kind: "ready"; readonly plan: JiraPublicationPlan }

export function createJiraReferenceTargets(
  manifest: JiraMigrationManifest,
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
  for (const [sourceAttachmentId, url] of Object.entries(
    attachmentUrlsBySourceId
  )) {
    targets[jiraReferenceKey("jira-attachment", sourceAttachmentId)] = { url }
  }
  return targets
}

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

export function createJiraPublicationPlan(
  manifest: JiraMigrationManifest,
  mappings: JiraMigrationMappings,
  preflight: JiraPreflightResult,
  attachmentUrlsBySourceId: Readonly<Record<string, string>>
): JiraPublicationPlanResult {
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
  const tagCandidates = new Map(
    buildTagCandidates(manifest).map((candidate) => [
      candidate.sourceId,
      candidate.destinationTag
    ])
  )

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
  for (const candidate of buildTagCandidates(manifest)) {
    if (
      candidate.destinationTag === null ||
      !includedTagSourceIds.has(candidate.sourceId)
    ) {
      continue
    }
    const sources = groupedTags.get(candidate.destinationTag)
    if (sources) sources.push(candidate.sourceId)
    else groupedTags.set(candidate.destinationTag, [candidate.sourceId])
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
  manifest: JiraMigrationManifest,
  mappings: JiraMigrationMappings
): { readonly issues: Set<string>; readonly comments: Set<string> } {
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
