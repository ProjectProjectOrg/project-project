import {
  ATTACHMENT_MAX_BYTES,
  isAllowedAttachmentContentType
} from "@projectproject/shared"
import type { JiraMigrationManifest } from "./Manifest"
import {
  buildOpenSprintConflicts,
  buildJiraStatusCreateOptions,
  buildTagCandidates,
  findTagCollisions,
  resolveTagDestinations,
  type JiraMappingSource,
  type JiraMigrationMappings
} from "./Mappings"
import { Effect, Schema } from "effect"
import { JiraMigrationConfiguration } from "@projectproject/shared"
import { JiraMigrationManifestV2 } from "./Manifest"
import {
  jiraConfigurationToMappings,
  jiraRestrictionPolicy,
  jiraV2MappingSource
} from "./Mappings"
export type JiraPreflightBlockerCode =
  | "incompatible-project-key"
  | "invalid-configuration"
  | "foreign-mapping-decision"
  | "duplicate-source-id"
  | "duplicate-source-key"
  | "duplicate-mapping-decision"
  | "project-slug-collision"
  | "project-key-collision"
  | "missing-identity-decision"
  | "invalid-linked-user"
  | "missing-status-mapping"
  | "invalid-destination-status"
  | "invalid-created-status"
  | "created-status-collision"
  | "missing-type-mapping"
  | "missing-priority-mapping"
  | "missing-ticket-id-mapping"
  | "duplicate-destination-ticket-id"
  | "ticket-id-collision"
  | "missing-restriction-decision"
  | "unrepresentable-tag"
  | "missing-tag-collision-decision"
  | "missing-open-sprint-decision"
  | "invalid-open-sprint-decision"
  | "unacknowledged-attachment-skip"

export type JiraPreflightWarningCode =
  | "source-visibility-limited"
  | "subtask-flattened"
  | "restricted-content-included"

export type JiraPreflightFinding<Code extends string> = Readonly<{
  code: Code
  subjectId: string
  detail: string | null
}>

export type JiraAttachmentPreflight = Readonly<{
  sourceAttachmentId: string
  action: "migrate" | "skip"
  reason: "too-large" | "unsupported-mime" | "unavailable" | null
}>

export type JiraPreflightEnvironment = Readonly<{
  existingProjectSlugs: ReadonlyArray<string>
  existingProjectKeys: ReadonlyArray<string>
  existingTicketIds: ReadonlyArray<string>
  existingUserIds: ReadonlyArray<string>
  existingStatusSlugs: ReadonlyArray<string>
}>

export type JiraPreflightResult = Readonly<{
  ready: boolean
  blockers: ReadonlyArray<JiraPreflightFinding<JiraPreflightBlockerCode>>
  warnings: ReadonlyArray<JiraPreflightFinding<JiraPreflightWarningCode>>
  attachments: ReadonlyArray<JiraAttachmentPreflight>
}>

export function preflightJiraMigration(
  manifest: JiraMappingSource & Pick<JiraMigrationManifest, "comments">,
  mappings: JiraMigrationMappings,
  environment: JiraPreflightEnvironment
): JiraPreflightResult {
  const blockers: Array<JiraPreflightFinding<JiraPreflightBlockerCode>> = []
  const warnings: Array<JiraPreflightFinding<JiraPreflightWarningCode>> = []

  findManifestDuplicates(manifest, blockers)

  if (environment.existingProjectSlugs.includes(mappings.project.slug)) {
    addFinding(blockers, "project-slug-collision", mappings.project.slug)
  }
  if (environment.existingProjectKeys.includes(mappings.project.key)) {
    addFinding(blockers, "project-key-collision", mappings.project.key)
  }

  const identityMappings = uniqueMapping(
    mappings.identities,
    ({ sourceAccountId }) => sourceAccountId,
    blockers
  )
  for (const identity of manifest.identities) {
    const decision = identityMappings.get(identity.accountId)
    if (!decision) {
      addFinding(blockers, "missing-identity-decision", identity.accountId)
    } else if (
      decision.resolution.kind === "link" &&
      !environment.existingUserIds.includes(decision.resolution.userId)
    ) {
      addFinding(
        blockers,
        "invalid-linked-user",
        identity.accountId,
        decision.resolution.userId
      )
    }
  }

  const statusMappings = uniqueMapping(
    mappings.statuses,
    ({ sourceStatusId }) => sourceStatusId,
    blockers
  )
  const statusCreateOptions = new Map(
    buildJiraStatusCreateOptions(manifest.statuses).map((candidate) => [
      candidate.sourceStatusId,
      candidate.createOption
    ])
  )
  for (const sourceStatusId of uniqueStrings(
    manifest.issues.map(({ statusId }) => statusId)
  )) {
    const mapping = statusMappings.get(sourceStatusId)
    if (!mapping) {
      addFinding(blockers, "missing-status-mapping", sourceStatusId)
    } else if (mapping.createStatus === true) {
      const candidate = statusCreateOptions.get(sourceStatusId)
      if (
        candidate === null ||
        candidate === undefined ||
        candidate.slug !== mapping.destinationStatusSlug
      ) {
        addFinding(
          blockers,
          "invalid-created-status",
          sourceStatusId,
          mapping.destinationStatusSlug
        )
      } else if (
        environment.existingStatusSlugs.includes(mapping.destinationStatusSlug)
      ) {
        addFinding(
          blockers,
          "created-status-collision",
          sourceStatusId,
          mapping.destinationStatusSlug
        )
      }
    } else if (
      !environment.existingStatusSlugs.includes(mapping.destinationStatusSlug)
    ) {
      addFinding(
        blockers,
        "invalid-destination-status",
        sourceStatusId,
        mapping.destinationStatusSlug
      )
    }
  }

  requireMappings(
    uniqueStrings(manifest.issues.map(({ issueTypeId }) => issueTypeId)),
    mappings.issueTypes,
    ({ sourceIssueTypeId }) => sourceIssueTypeId,
    "missing-type-mapping",
    blockers
  )
  requireMappings(
    uniqueStrings(
      manifest.issues.map(({ priorityId }) => priorityMappingKey(priorityId))
    ),
    mappings.priorities,
    ({ sourcePriorityId }) => priorityMappingKey(sourcePriorityId),
    "missing-priority-mapping",
    blockers
  )

  const ticketMappings = uniqueMapping(
    mappings.ticketIds,
    ({ sourceIssueId }) => sourceIssueId,
    blockers
  )
  for (const issue of manifest.issues) {
    if (!ticketMappings.has(issue.id)) {
      addFinding(blockers, "missing-ticket-id-mapping", issue.id)
    }
  }
  const destinationTicketGroups = groupBy(
    mappings.ticketIds,
    ({ destinationTicketId }) => destinationTicketId
  )
  for (const [destinationTicketId, rows] of destinationTicketGroups) {
    if (rows.length > 1) {
      addFinding(
        blockers,
        "duplicate-destination-ticket-id",
        destinationTicketId
      )
    }
    if (environment.existingTicketIds.includes(destinationTicketId)) {
      addFinding(blockers, "ticket-id-collision", destinationTicketId)
    }
  }

  const restrictionMappings = uniqueMapping(
    mappings.restrictions,
    ({ restrictionId }) => restrictionId,
    blockers
  )
  for (const restriction of manifest.restrictions) {
    const decision = restrictionMappings.get(restriction.id)
    if (!decision) {
      addFinding(blockers, "missing-restriction-decision", restriction.id)
    } else if (decision.resolution === "include_acknowledged") {
      addFinding(
        warnings,
        "restricted-content-included",
        restriction.id,
        restriction.targetId
      )
    }
  }

  const candidates = buildTagCandidates(manifest)
  const resolvedTags = resolveTagDestinations(manifest, mappings)
  for (const candidate of candidates) {
    if ((resolvedTags.get(candidate.sourceId) ?? null) === null) {
      addFinding(blockers, "unrepresentable-tag", candidate.sourceId)
    }
  }
  const tagCollisionMappings = uniqueMapping(
    mappings.tagCollisions,
    ({ destinationTag }) => destinationTag,
    blockers
  )
  for (const collision of findTagCollisions(candidates)) {
    const decision = tagCollisionMappings.get(collision.destinationTag)
    if (!decision || !sameStrings(decision.sourceIds, collision.sourceIds)) {
      addFinding(
        blockers,
        "missing-tag-collision-decision",
        collision.destinationTag
      )
    }
  }

  const sprintMappings = uniqueMapping(
    mappings.openSprintMemberships,
    ({ sourceIssueId }) => sourceIssueId,
    blockers
  )
  for (const conflict of buildOpenSprintConflicts(manifest)) {
    const decision = sprintMappings.get(conflict.sourceIssueId)
    if (!decision) {
      addFinding(
        blockers,
        "missing-open-sprint-decision",
        conflict.sourceIssueId
      )
    } else if (
      decision.selectedGroupId !== null &&
      !conflict.candidateGroupIds.includes(decision.selectedGroupId)
    ) {
      addFinding(
        blockers,
        "invalid-open-sprint-decision",
        conflict.sourceIssueId,
        decision.selectedGroupId
      )
    }
  }

  const attachments = manifest.attachments
    .map(classifyAttachment)
    .toSorted((left, right) =>
      compareStrings(left.sourceAttachmentId, right.sourceAttachmentId)
    )
  const acknowledgedSkips = new Set(mappings.acknowledgedSkippedAttachmentIds)
  for (const attachment of attachments) {
    if (
      attachment.action === "skip" &&
      !acknowledgedSkips.has(attachment.sourceAttachmentId)
    ) {
      addFinding(
        blockers,
        "unacknowledged-attachment-skip",
        attachment.sourceAttachmentId,
        attachment.reason
      )
    }
  }

  for (const coverage of manifest.coverage) {
    if (coverage.visibility !== "complete") {
      addFinding(
        warnings,
        "source-visibility-limited",
        coverage.category,
        coverage.reason
      )
    }
  }
  const subtaskTypes = new Set(
    manifest.issueTypes.filter(({ subtask }) => subtask).map(({ id }) => id)
  )
  for (const issue of manifest.issues) {
    if (subtaskTypes.has(issue.issueTypeId)) {
      addFinding(warnings, "subtask-flattened", issue.id, issue.parentIssueId)
    }
  }

  const sortedBlockers = blockers.toSorted(compareFindings)
  const sortedWarnings = warnings.toSorted(compareFindings)
  return {
    ready: sortedBlockers.length === 0,
    blockers: sortedBlockers,
    warnings: sortedWarnings,
    attachments
  }
}

function classifyAttachment(
  attachment: JiraMigrationManifest["attachments"][number]
): JiraAttachmentPreflight {
  if (!attachment.downloadAllowed || attachment.downloadUrl === null) {
    return {
      sourceAttachmentId: attachment.id,
      action: "skip",
      reason: "unavailable"
    }
  }
  if (attachment.byteSize <= 0 || attachment.byteSize > ATTACHMENT_MAX_BYTES) {
    return {
      sourceAttachmentId: attachment.id,
      action: "skip",
      reason: "too-large"
    }
  }
  if (!isAllowedAttachmentContentType(attachment.mimeType)) {
    return {
      sourceAttachmentId: attachment.id,
      action: "skip",
      reason: "unsupported-mime"
    }
  }
  return {
    sourceAttachmentId: attachment.id,
    action: "migrate",
    reason: null
  }
}

function findManifestDuplicates(
  manifest: JiraMappingSource & Pick<JiraMigrationManifest, "comments">,
  blockers: Array<JiraPreflightFinding<JiraPreflightBlockerCode>>
): void {
  const collections: ReadonlyArray<ReadonlyArray<Readonly<{ id: string }>>> = [
    manifest.statuses,
    manifest.issueTypes,
    manifest.priorities,
    manifest.components,
    manifest.issues,
    manifest.comments,
    manifest.attachments,
    manifest.groups,
    manifest.restrictions
  ]
  for (const collection of collections) {
    for (const id of duplicateStrings(collection.map(({ id }) => id))) {
      addFinding(blockers, "duplicate-source-id", id)
    }
  }
  for (const accountId of duplicateStrings(
    manifest.identities.map(({ accountId }) => accountId)
  )) {
    addFinding(blockers, "duplicate-source-id", accountId)
  }
  for (const key of duplicateStrings(manifest.issues.map(({ key }) => key))) {
    addFinding(blockers, "duplicate-source-key", key)
  }
}

function requireMappings<A>(
  requiredIds: ReadonlyArray<string>,
  mappings: ReadonlyArray<A>,
  key: (mapping: A) => string,
  code: "missing-type-mapping" | "missing-priority-mapping",
  blockers: Array<JiraPreflightFinding<JiraPreflightBlockerCode>>
): void {
  const mapped = uniqueMapping(mappings, key, blockers)
  for (const requiredId of requiredIds) {
    if (!mapped.has(requiredId)) addFinding(blockers, code, requiredId)
  }
}

function uniqueMapping<A>(
  mappings: ReadonlyArray<A>,
  key: (mapping: A) => string,
  blockers: Array<JiraPreflightFinding<JiraPreflightBlockerCode>>
): Map<string, A> {
  const grouped = groupBy(mappings, key)
  const unique = new Map<string, A>()
  for (const [mappingKey, values] of grouped) {
    if (values.length > 1) {
      addFinding(blockers, "duplicate-mapping-decision", mappingKey)
    } else {
      unique.set(mappingKey, values[0])
    }
  }
  return unique
}

function groupBy<A>(
  values: ReadonlyArray<A>,
  key: (value: A) => string
): Map<string, Array<A>> {
  const grouped = new Map<string, Array<A>>()
  for (const value of values) {
    const mappingKey = key(value)
    const existing = grouped.get(mappingKey)
    if (existing) existing.push(value)
    else grouped.set(mappingKey, [value])
  }
  return grouped
}

function duplicateStrings(
  values: ReadonlyArray<string>
): ReadonlyArray<string> {
  return [...groupBy(values, (value) => value)]
    .filter(([, grouped]) => grouped.length > 1)
    .map(([value]) => value)
    .toSorted(compareStrings)
}

function uniqueStrings(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)].toSorted(compareStrings)
}

function sameStrings(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>
): boolean {
  const normalizedLeft = uniqueStrings(left)
  const normalizedRight = uniqueStrings(right)
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  )
}

function addFinding<Code extends string>(
  findings: Array<JiraPreflightFinding<Code>>,
  code: Code,
  subjectId: string,
  detail: string | null = null
): void {
  findings.push({ code, subjectId, detail })
}

function compareFindings<Code extends string>(
  left: JiraPreflightFinding<Code>,
  right: JiraPreflightFinding<Code>
): number {
  return (
    compareStrings(left.code, right.code) ||
    compareStrings(left.subjectId, right.subjectId) ||
    compareNullableStrings(left.detail, right.detail)
  )
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

function priorityMappingKey(sourcePriorityId: string | null): string {
  return sourcePriorityId === null ? "priority:none" : sourcePriorityId
}

export const decodeFrozenManifest = Schema.decodeUnknownEffect(
  JiraMigrationManifestV2
)
export const JiraPreflightEnvironmentSchema = Schema.Struct({
  existingProjectSlugs: Schema.Array(Schema.String),
  existingProjectKeys: Schema.Array(Schema.String),
  existingTicketIds: Schema.Array(Schema.String),
  existingUserIds: Schema.Array(Schema.String),
  existingStatusSlugs: Schema.Array(Schema.String)
})
export class JiraPublicationInvalid extends Schema.TaggedError<JiraPublicationInvalid>()(
  "JiraPublicationInvalid",
  {
    reasons: Schema.Array(Schema.String)
  }
) {
  override get message() {
    return this.reasons.join(", ")
  }
}
export const preflightJiraMigrationV2 = Effect.fn("preflightJiraMigrationV2")(
  function* (
    input: Readonly<{
      manifest: JiraMigrationManifestV2
      configuration: JiraMigrationConfiguration
      environment: JiraPreflightEnvironment
    }>
  ) {
    const manifest = yield* decodeFrozenManifest(input.manifest)
    const configuration = yield* Schema.decodeUnknownEffect(
      JiraMigrationConfiguration
    )(input.configuration)
    const environment = yield* Schema.decodeUnknownEffect(
      JiraPreflightEnvironmentSchema
    )(input.environment)
    const source = {
      ...jiraV2MappingSource(manifest),
      comments: manifest.comments.map((comment) => ({
        ...comment,
        authorDisplayName: "",
        body: { markdown: "", adf: null, warnings: [], references: [] },
        raw: null
      }))
    }
    const mappings = jiraConfigurationToMappings(source, configuration)
    const result = preflightJiraMigration(source, mappings, environment)
    const excludedIssueIds = new Set(
      jiraRestrictionPolicy(configuration) === "exclude"
        ? manifest.restrictions
            .filter((restriction) => restriction.targetKind === "issue")
            .map((restriction) => restriction.targetId)
        : []
    )
    const blockers = result.blockers.filter(
      (blocker) =>
        blocker.code !== "unacknowledged-attachment-skip" ||
        !manifest.attachments.some(
          (attachment) =>
            attachment.id === blocker.subjectId &&
            excludedIssueIds.has(attachment.issueId)
        )
    )
    for (const status of manifest.statuses)
      if (!configuration.statuses.some((x) => x.jiraStatusId === status.id))
        addFinding(blockers, "missing-status-mapping", status.id)
    for (const type of manifest.issueTypes)
      if (!configuration.issueTypes.some((x) => x.jiraIssueTypeId === type.id))
        addFinding(blockers, "missing-type-mapping", type.id)
    for (const priority of manifest.priorities)
      if (
        !configuration.priorities.some((x) => x.jiraPriorityId === priority.id)
      )
        addFinding(blockers, "missing-priority-mapping", priority.id)

    if (
      manifest.issues.some(
        (issue) =>
          issue.key !== `${manifest.source.projectKey}-${issue.issueNumber}`
      )
    )
      addFinding(
        blockers,
        "incompatible-project-key",
        configuration.destination.key
      )
    const validateChoices = (
      provided: ReadonlyArray<string>,
      allowed: ReadonlyArray<string>
    ) => {
      for (const id of provided)
        if (!allowed.includes(id))
          addFinding(blockers, "foreign-mapping-decision", id)
      for (const id of duplicateStrings(provided))
        addFinding(blockers, "duplicate-mapping-decision", id)
    }
    validateChoices(
      configuration.identities.map((x) => x.jiraAccountId),
      manifest.identities.map((x) => x.accountId)
    )
    validateChoices(
      configuration.statuses.map((x) => x.jiraStatusId),
      manifest.statuses.map((x) => x.id)
    )
    validateChoices(
      configuration.issueTypes.map((x) => x.jiraIssueTypeId),
      manifest.issueTypes.map((x) => x.id)
    )
    validateChoices(
      configuration.priorities.map((x) => x.jiraPriorityId),
      manifest.priorities.map((x) => x.id)
    )
    validateChoices(
      configuration.skippedAttachmentIds,
      manifest.attachments.map((x) => x.id)
    )
    validateChoices(
      configuration.activeFutureSprintChoices.map((x) => x.jiraIssueId),
      buildOpenSprintConflicts(source).map((x) => x.sourceIssueId)
    )
    validateChoices(
      configuration.tags.map((x) => `${x.source.kind}:${x.source.value}`),
      buildTagCandidates(source).map((x) => `${x.sourceKind}:${x.sourceValue}`)
    )
    if (
      configuration.skippedAttachmentIds.length > 0 &&
      !configuration.attachmentSkipsAccepted
    )
      addFinding(blockers, "unacknowledged-attachment-skip", "consent")
    const createOptions = new Map(
      buildJiraStatusCreateOptions(manifest.statuses).map((option) => [
        option.sourceStatusId,
        option.createOption
      ])
    )
    for (const mapping of configuration.statuses) {
      if (mapping.createStatus) {
        const candidate = createOptions.get(mapping.jiraStatusId)
        if (!candidate || candidate.slug !== mapping.projectStatusSlug)
          addFinding(blockers, "invalid-created-status", mapping.jiraStatusId)
        else if (environment.existingStatusSlugs.includes(candidate.slug))
          addFinding(blockers, "created-status-collision", mapping.jiraStatusId)
      } else if (
        !environment.existingStatusSlugs.includes(mapping.projectStatusSlug)
      )
        addFinding(blockers, "invalid-destination-status", mapping.jiraStatusId)
    }
    const created = configuration.statuses
      .filter((mapping) => mapping.createStatus)
      .flatMap((mapping) => {
        const candidate = createOptions.get(mapping.jiraStatusId)
        return candidate
          ? [{ sourceId: mapping.jiraStatusId, ...candidate }]
          : []
      })
    for (const candidate of created)
      if (
        created.some(
          (other) =>
            other.sourceId !== candidate.sourceId &&
            (other.slug === candidate.slug ||
              other.label === candidate.label) &&
            (other.label !== candidate.label || other.icon !== candidate.icon)
        )
      )
        addFinding(blockers, "created-status-collision", candidate.sourceId)
    const attachments = result.attachments.map((attachment) =>
      configuration.skippedAttachmentIds.includes(attachment.sourceAttachmentId)
        ? { ...attachment, action: "skip" as const }
        : attachment
    )
    return {
      ...result,
      attachments,
      blockers: blockers.toSorted(compareFindings),
      ready: blockers.length === 0,
      mappings,
      source
    }
  }
)
