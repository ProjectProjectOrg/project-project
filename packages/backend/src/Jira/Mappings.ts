import { createHash } from "node:crypto"
import {
  BASELINE_STATUS_COLORS,
  CreatableProjectKey,
  pickStatusColor,
  deriveStatusSlug,
  isReservedStatusSlug,
  Slug,
  StatusLabel,
  StatusSlug,
  TicketId,
  TicketPriority,
  TicketType
} from "@projectproject/shared"
import * as Schema from "effect/Schema"
import type { JiraMigrationConfiguration } from "@projectproject/shared"
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
      destinationStatusSlug: StatusSlug,
      createStatus: Schema.optional(Schema.Literal(true))
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
  ),
  tagOverrides: Schema.optional(
    Schema.Array(
      Schema.Struct({
        sourceKind: Schema.Literals(["label", "component"]),
        sourceValue: Schema.NonEmptyString,
        destinationTag: Schema.NonEmptyString
      })
    )
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

export type JiraStatusCreateOption = {
  readonly slug: string
  readonly label: string
  readonly icon: "CircleDashed" | "CircleDot" | "CircleCheck"
  readonly color: string
  readonly isTerminal: false
}

export type JiraStatusCreateCandidate = {
  readonly sourceStatusId: string
  readonly createOption: JiraStatusCreateOption | null
}

export function buildJiraStatusCreateOptions(
  statuses: ReadonlyArray<
    Pick<
      JiraMigrationManifest["statuses"][number],
      "id" | "name" | "categoryKey"
    >
  >
): ReadonlyArray<JiraStatusCreateCandidate> {
  const candidates = statuses.map((status) => {
    const style = statusStyle(status.categoryKey)
    const derived = deriveStatusSlug(status.name)
    const slug =
      Schema.is(StatusSlug)(derived) && Schema.is(StatusLabel)(status.name)
        ? derived
        : null
    return {
      sourceStatusId: status.id,
      baseSlug: slug,
      descriptor: {
        label: status.name,
        ...style,
        color: "",
        isTerminal: false as const
      }
    }
  })
  const bySlug = new Map<string, Array<(typeof candidates)[number]>>()
  for (const candidate of candidates) {
    if (candidate.baseSlug === null) continue
    const matching = bySlug.get(candidate.baseSlug)
    if (matching) matching.push(candidate)
    else bySlug.set(candidate.baseSlug, [candidate])
  }
  const resolved = candidates.map(
    ({ sourceStatusId, baseSlug, descriptor }) => {
      if (baseSlug === null) {
        return { sourceStatusId, slug: null, descriptor }
      }
      const matching = bySlug.get(baseSlug) ?? []
      const descriptors = new Set(
        matching.map(({ descriptor }) =>
          JSON.stringify([
            descriptor.label,
            descriptor.icon,
            descriptor.isTerminal
          ])
        )
      )
      const slug =
        isReservedStatusSlug(baseSlug) || descriptors.size > 1
          ? hashedStatusSlug(baseSlug, sourceStatusId)
          : baseSlug
      return { sourceStatusId, slug, descriptor }
    }
  )

  const usedColors: Array<string> = [...BASELINE_STATUS_COLORS]
  const colorBySlug = new Map<string, string>()
  for (const { slug } of resolved) {
    if (slug === null || colorBySlug.has(slug)) continue
    const color = pickStatusColor(usedColors)
    usedColors.push(color)
    colorBySlug.set(slug, color)
  }

  return resolved
    .map(({ sourceStatusId, slug, descriptor }) =>
      slug === null
        ? { sourceStatusId, createOption: null }
        : {
            sourceStatusId,
            createOption: {
              ...descriptor,
              slug,
              color: colorBySlug.get(slug) ?? descriptor.color
            }
          }
    )
    .toSorted((left, right) =>
      compareStrings(left.sourceStatusId, right.sourceStatusId)
    )
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

function statusStyle(
  categoryKey: string | null
): Pick<JiraStatusCreateOption, "icon"> {
  if (categoryKey === "indeterminate") {
    return { icon: "CircleDot" }
  }
  if (categoryKey === "done") {
    return { icon: "CircleCheck" }
  }
  return { icon: "CircleDashed" }
}

function hashedStatusSlug(baseSlug: string, sourceStatusId: string): string {
  const hash = createHash("sha256")
    .update(sourceStatusId)
    .digest("hex")
    .slice(0, 8)
  const prefix = baseSlug.slice(0, 31).replace(/_+$/g, "")
  return `${prefix}_${hash}`
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function jiraConfigurationToMappings(
  manifest: JiraMigrationManifest,
  configuration: JiraMigrationConfiguration
): JiraMigrationMappings {
  const restrictionResolution =
    configuration.restrictedContent.policy === "include"
      ? ("include_acknowledged" as const)
      : ("exclude" as const)
  const candidates = buildTagCandidates(manifest)
  const collisions = findTagCollisions(candidates)
  return {
    project: {
      slug: configuration.destination.slug,
      key: configuration.destination.key,
      name: configuration.destination.name
    },
    identities: configuration.identities.map(
      ({ jiraAccountId, projectProjectUserId }) => ({
        sourceAccountId: jiraAccountId,
        resolution:
          projectProjectUserId === null
            ? ({ kind: "unlinked" } as const)
            : ({ kind: "link", userId: projectProjectUserId } as const)
      })
    ),
    statuses: configuration.statuses.map(
      ({ jiraStatusId, projectStatusSlug, createStatus }) =>
        createStatus === true
          ? {
              sourceStatusId: jiraStatusId,
              destinationStatusSlug: projectStatusSlug,
              createStatus: true as const
            }
          : {
              sourceStatusId: jiraStatusId,
              destinationStatusSlug: projectStatusSlug
            }
    ),
    issueTypes: configuration.issueTypes.map(
      ({ jiraIssueTypeId, projectType }) => ({
        sourceIssueTypeId: jiraIssueTypeId,
        destinationType: projectType
      })
    ),
    priorities: configuration.priorities.map(
      ({ jiraPriorityId, projectPriority }) => ({
        sourcePriorityId: jiraPriorityId,
        destinationPriority: projectPriority
      })
    ),
    ticketIds: buildDefaultTicketIdMappings(manifest),
    restrictions: manifest.restrictions.map(({ id }) => ({
      restrictionId: id,
      resolution: restrictionResolution
    })),
    acknowledgedSkippedAttachmentIds: configuration.skippedAttachmentIds,
    tagCollisions: collisions.map(({ destinationTag, sourceIds }) => ({
      destinationTag,
      sourceIds,
      resolution: "merge" as const
    })),
    openSprintMemberships: configuration.activeFutureSprintChoices.map(
      ({ jiraIssueId, jiraSprintId }) => ({
        sourceIssueId: jiraIssueId,
        selectedGroupId: jiraSprintId
      })
    ),
    tagOverrides: configuration.tags.map(({ source, destinationTagName }) => ({
      sourceKind: source.kind,
      sourceValue: source.value,
      destinationTag: destinationTagName
    }))
  }
}

export function resolveTagDestinations(
  manifest: JiraMigrationManifest,
  mappings: JiraMigrationMappings
): ReadonlyMap<string, string | null> {
  const overrides = new Map(
    (mappings.tagOverrides ?? []).map((override) => [
      `${override.sourceKind}:${override.sourceValue}`,
      override.destinationTag
    ])
  )
  return new Map(
    buildTagCandidates(manifest).map((candidate) => [
      candidate.sourceId,
      overrides.get(`${candidate.sourceKind}:${candidate.sourceValue}`) ??
        candidate.destinationTag
    ])
  )
}
