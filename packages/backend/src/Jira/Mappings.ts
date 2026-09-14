import {
  CreatableProjectKey,
  Slug,
  StatusSlug,
  TicketId,
  TicketPriority,
  TicketType
} from "@projectproject/shared"
import * as Schema from "effect/Schema"
import type { JiraMigrationManifest } from "./Manifest"

export const JiraIdentityResolution = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal("link"),
    userId: Schema.NonEmptyString
  }),
  Schema.Struct({ kind: Schema.Literal("unlinked") })
])
export type JiraIdentityResolution = typeof JiraIdentityResolution.Type

export const JiraMigrationMappings = Schema.Struct({
  project: Schema.Struct({
    slug: Slug,
    key: CreatableProjectKey,
    name: Schema.NonEmptyString
  }),
  identities: Schema.Array(
    Schema.Struct({
      sourceAccountId: Schema.NonEmptyString,
      resolution: JiraIdentityResolution
    })
  ),
  statuses: Schema.Array(
    Schema.Struct({
      sourceStatusId: Schema.NonEmptyString,
      destinationStatusSlug: StatusSlug
    })
  ),
  issueTypes: Schema.Array(
    Schema.Struct({
      sourceIssueTypeId: Schema.NonEmptyString,
      destinationType: TicketType
    })
  ),
  priorities: Schema.Array(
    Schema.Struct({
      sourcePriorityId: Schema.NullOr(Schema.NonEmptyString),
      destinationPriority: TicketPriority
    })
  ),
  ticketIds: Schema.Array(
    Schema.Struct({
      sourceIssueId: Schema.NonEmptyString,
      destinationTicketId: TicketId
    })
  ),
  restrictions: Schema.Array(
    Schema.Struct({
      restrictionId: Schema.NonEmptyString,
      resolution: Schema.Literals(["exclude", "include_acknowledged"])
    })
  ),
  acknowledgedSkippedAttachmentIds: Schema.Array(Schema.NonEmptyString),
  tagCollisions: Schema.Array(
    Schema.Struct({
      destinationTag: Schema.NonEmptyString,
      sourceIds: Schema.Array(Schema.NonEmptyString),
      resolution: Schema.Literal("merge")
    })
  ),
  openSprintMemberships: Schema.Array(
    Schema.Struct({
      sourceIssueId: Schema.NonEmptyString,
      selectedGroupId: Schema.NullOr(Schema.String)
    })
  )
})
export type JiraMigrationMappings = typeof JiraMigrationMappings.Type

export type TicketIdMapping = JiraMigrationMappings["ticketIds"][number]

export type JiraTagSourceKind = "label" | "component"

export type JiraTagCandidate = {
  readonly sourceId: string
  readonly sourceKind: JiraTagSourceKind
  readonly sourceValue: string
  readonly destinationTag: string | null
  readonly changed: boolean
}

export type JiraTagCollision = {
  readonly destinationTag: string
  readonly sourceIds: ReadonlyArray<string>
}

export type OpenSprintConflict = {
  readonly sourceIssueId: string
  readonly candidateGroupIds: ReadonlyArray<string>
}

export function buildDefaultTicketIdMappings(
  manifest: JiraMigrationManifest
): ReadonlyArray<TicketIdMapping> {
  return manifest.issues
    .filter(({ key }) => Schema.is(TicketId)(key))
    .map(({ id, key }) => ({
      sourceIssueId: id,
      destinationTicketId: Schema.decodeSync(TicketId)(key)
    }))
    .toSorted((left, right) =>
      compareStrings(left.destinationTicketId, right.destinationTicketId)
    )
}

export function normalizeJiraTag(
  sourceValue: string,
  sourceKind: JiraTagSourceKind
): string | null {
  const normalized = sourceValue
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (normalized.length === 0) return null
  const prefix = sourceKind === "component" ? "component:" : ""
  const available = 31 - prefix.length
  const truncated = normalized.slice(0, available).replace(/-+$/g, "")
  return truncated.length === 0 ? null : `${prefix}${truncated}`
}

export function buildTagCandidates(
  manifest: JiraMigrationManifest
): ReadonlyArray<JiraTagCandidate> {
  const labels = new Set(manifest.issues.flatMap(({ labels }) => labels))
  const candidates: Array<JiraTagCandidate> = []
  for (const component of manifest.components) {
    candidates.push(makeTagCandidate("component", component.id, component.name))
  }
  for (const label of labels) {
    candidates.push(makeTagCandidate("label", label, label))
  }
  return candidates.toSorted((left, right) =>
    compareStrings(left.sourceId, right.sourceId)
  )
}

export function findTagCollisions(
  candidates: ReadonlyArray<JiraTagCandidate>
): ReadonlyArray<JiraTagCollision> {
  const groups = new Map<string, Array<string>>()
  for (const candidate of candidates) {
    if (candidate.destinationTag === null) continue
    const sourceIds = groups.get(candidate.destinationTag)
    if (sourceIds) sourceIds.push(candidate.sourceId)
    else groups.set(candidate.destinationTag, [candidate.sourceId])
  }
  return [...groups]
    .filter(([, sourceIds]) => new Set(sourceIds).size > 1)
    .map(([destinationTag, sourceIds]) => ({
      destinationTag,
      sourceIds: [...new Set(sourceIds)].toSorted(compareStrings)
    }))
    .toSorted((left, right) =>
      compareStrings(left.destinationTag, right.destinationTag)
    )
}

export function buildOpenSprintConflicts(
  manifest: JiraMigrationManifest
): ReadonlyArray<OpenSprintConflict> {
  const openMemberships = new Map<string, Array<string>>()
  for (const group of manifest.groups) {
    if (
      group.kind !== "sprint" ||
      (group.state !== "active" && group.state !== "future")
    ) {
      continue
    }
    for (const issueId of group.issueIds) {
      const memberships = openMemberships.get(issueId)
      if (memberships) memberships.push(group.id)
      else openMemberships.set(issueId, [group.id])
    }
  }
  return [...openMemberships]
    .filter(([, groupIds]) => new Set(groupIds).size > 1)
    .map(([sourceIssueId, groupIds]) => ({
      sourceIssueId,
      candidateGroupIds: [...new Set(groupIds)].toSorted(compareStrings)
    }))
    .toSorted((left, right) =>
      compareStrings(left.sourceIssueId, right.sourceIssueId)
    )
}

function makeTagCandidate(
  sourceKind: JiraTagSourceKind,
  sourceKey: string,
  sourceValue: string
): JiraTagCandidate {
  const destinationTag = normalizeJiraTag(sourceValue, sourceKind)
  return {
    sourceId: `${sourceKind}:${sourceKey}`,
    sourceKind,
    sourceValue,
    destinationTag,
    changed: destinationTag !== sourceValue
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
