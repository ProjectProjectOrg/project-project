import {
  ATTACHMENT_MAX_BYTES,
  JiraMigrationRequirements,
  isAllowedAttachmentContentType,
  type JiraMigrationFinding,
  type JiraMigrationScanSummary,
  type JiraMigrationUserOption,
  isEpicType,
  EPIC_TYPE,
  TypeKey
} from "@pp/shared"
import { Option, Predicate, Stream } from "effect"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { convertAdfToMarkdown } from "./Adf"
import type {
  JiraComment,
  JiraComponent,
  JiraIssue,
  JiraIssueTypeStatuses,
  JiraUser,
  JiraPriority,
  JiraProject,
  JiraSprint,
  JiraStatus,
  JiraVersion,
  JiraWorklog
} from "./ClientSchemas"
import { countBy, groupBy } from "./collections"
import { jiraFinding } from "./Findings"
import { resolveJiraHierarchy } from "./Hierarchy"
import {
  isCoverageLimited,
  JiraMigrationManifest,
  normalizeJiraManifest
} from "./Manifest"
import {
  buildJiraStatusCreateOptions,
  buildOpenSprintConflicts,
  buildTagCandidates,
  findTagCollisions
} from "./Mappings"
import {
  scanFailure,
  type JiraScanPageInput,
  type JiraScanPageResult
} from "./MigrationActivities"

const decodeUnknownJiraMigrationManifest = Schema.decodeUnknownEffect(
  JiraMigrationManifest
)

const decodeUnknownJiraMigrationRequirements = Schema.decodeUnknownEffect(
  JiraMigrationRequirements
)

export type JiraScanInput = Readonly<{
  migrationId: string
  cloudId: string
  siteName: string
  siteUrl: string
  project: JiraProject
  statuses: ReadonlyArray<JiraIssueTypeStatuses>
  priorities: ReadonlyArray<JiraPriority>
  components: ReadonlyArray<JiraComponent>
  versions: ReadonlyArray<JiraVersion>
  issues: ReadonlyArray<JiraIssue>
  commentsByIssue: Readonly<Record<string, ReadonlyArray<JiraComment>>>
  worklogsByIssue: Readonly<Record<string, ReadonlyArray<JiraWorklog>>>
  sprints: ReadonlyArray<
    Readonly<{
      sprint: JiraSprint
      issueIds: ReadonlyArray<string>
    }>
  >
  identityOptions: ReadonlyArray<JiraMigrationUserOption>
  scannedAt: DateTime.Utc
}>

const convertedText = (value: Schema.Json | undefined) => {
  if (typeof value === "string") {
    return { markdown: value, warnings: [], references: [], adf: value }
  }
  if (value === null || value === undefined) return null
  const converted = convertAdfToMarkdown(value)
  return { ...converted, adf: value }
}

const userRecord = (user: JiraUser | null | undefined) =>
  user == null
    ? null
    : {
        accountId: user.accountId,
        displayName: user.displayName,
        emailAddress: user.emailAddress || null,
        active: user.active ?? null,
        accountType: user.accountType || null,
        raw: user
      }

const issueNumber = (key: string): number => {
  const value = Number(key.slice(key.lastIndexOf("-") + 1))
  return Number.isInteger(value) && value > 0 ? value : 1
}

const suggestedSlug = (name: string): string => {
  const normalized = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "")
  return normalized || "jira-project"
}

const suggestedKey = (key: string, name: string): string => {
  if (/^[A-Z][A-Z0-9]{1,9}$/.test(key)) return key
  const normalized = name.toUpperCase().replace(/[^A-Z0-9]/g, "")
  const prefixed = /^[A-Z]/.test(normalized) ? normalized : `J${normalized}`
  return (prefixed.slice(0, 10) || "JIRA").padEnd(2, "X")
}

const suggestedIssueType = (
  name: string,
  hierarchyLevel: number | null
): TypeKey | null => {
  const lower = name.toLowerCase()
  return isJiraEpicLevel({ name, hierarchyLevel })
    ? EPIC_TYPE
    : lower.includes("bug") || lower.includes("defect")
      ? TypeKey.make("bug")
      : lower.includes("task") || lower.includes("chore")
        ? TypeKey.make("chore")
        : lower.includes("story") || lower.includes("feature")
          ? TypeKey.make("feat")
          : null
}

const suggestedPriority = (name: string) => {
  const lower = name.toLowerCase()
  return lower.includes("highest") || lower.includes("high")
    ? "high"
    : lower.includes("lowest") || lower.includes("low")
      ? "low"
      : "med"
}

const IssueTypeLevel = Schema.Struct({
  id: Schema.String,
  hierarchyLevel: Schema.Int
})
const decodeIssueTypeLevel = Schema.decodeUnknownOption(IssueTypeLevel)
const decodeParentTypeLevel = Schema.decodeUnknownOption(
  Schema.Struct({ fields: Schema.Struct({ issuetype: IssueTypeLevel }) })
)

const issueTypeLevels = (issues: ReadonlyArray<JiraIssue>) => {
  const levels = new Map<string, number>()
  for (const issue of issues) {
    const own = decodeIssueTypeLevel(issue.fields.issuetype)
    if (Option.isSome(own)) levels.set(own.value.id, own.value.hierarchyLevel)
    const parent = decodeParentTypeLevel(issue.fields.parent)
    if (Option.isSome(parent))
      levels.set(
        parent.value.fields.issuetype.id,
        parent.value.fields.issuetype.hierarchyLevel
      )
  }
  return levels
}

export const isJiraEpicLevel = (
  issueType: Readonly<{ name: string; hierarchyLevel?: number | null }>
) =>
  issueType.hierarchyLevel === undefined || issueType.hierarchyLevel === null
    ? issueType.name.toLowerCase() === "epic"
    : issueType.hierarchyLevel >= 1

const uniqueBy = <A>(values: ReadonlyArray<A>, key: (value: A) => string) => [
  ...new Map(values.map((value) => [key(value), value])).values()
]

const IssueEntityReference = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.optional(Schema.String),
  subtask: Schema.optional(Schema.Boolean),
  hierarchyLevel: Schema.optional(Schema.Int),
  statusCategory: Schema.optional(
    Schema.Struct({
      id: Schema.optional(Schema.Finite),
      key: Schema.optional(Schema.String),
      name: Schema.optional(Schema.String)
    })
  )
})
const decodeIssueEntityReference =
  Schema.decodeUnknownOption(IssueEntityReference)
type IssueEntityReference = typeof IssueEntityReference.Type

const UNKNOWN_SOURCE_ENTITY_ID = "unknown"

const repairedReference = (
  label: string,
  id: string,
  name: string,
  issueKey: string
): JiraMigrationFinding =>
  jiraFinding(
    "source-reference-repaired",
    `${label} "${name}"`,
    id === UNKNOWN_SOURCE_ENTITY_ID
      ? `${issueKey} had no readable ${label} in Jira, so it uses a placeholder "${name}". Map it in Set up like any other ${label}.`
      : `Jira's list of this project's ${label}s did not include it, but ${issueKey} uses it, so it was added from that issue. Map it in Set up like any other ${label}.`,
    id
  )

const repairEntities = <A extends Readonly<{ id: string }>>(
  label: string,
  unknownName: string,
  listed: ReadonlyArray<A>,
  references: ReadonlyArray<
    Readonly<{ issueKey: string; value: unknown; required: boolean }>
  >,
  build: (id: string, name: string, reference: IssueEntityReference | null) => A
) => {
  const entities = [...listed]
  const known = new Set(listed.map(({ id }) => id))
  const findings: Array<JiraMigrationFinding> = []
  for (const { issueKey, value, required } of references) {
    const reference = Option.getOrNull(decodeIssueEntityReference(value))
    if (reference === null && !required) continue
    const id = reference?.id ?? UNKNOWN_SOURCE_ENTITY_ID
    if (known.has(id)) continue
    const name =
      reference?.name ||
      (id === UNKNOWN_SOURCE_ENTITY_ID ? unknownName : `${unknownName} ${id}`)
    known.add(id)
    entities.push(build(id, name, reference))
    findings.push(repairedReference(label, id, name, issueKey))
  }
  return { entities, findings }
}

export const buildJiraScanArtifacts = (input: JiraScanInput) =>
  Effect.gen(function* () {
    const identities = input.issues
      .flatMap((issue) => [userRecord(issue.fields.assignee)])
      .concat(
        Object.values(input.commentsByIssue)
          .flat()
          .map((comment) => userRecord(comment.author)),
        Object.values(input.worklogsByIssue)
          .flat()
          .map((worklog) => userRecord(worklog.author)),
        [input.project.lead ? userRecord(input.project.lead) : null]
      )
      .filter((value): value is NonNullable<typeof value> => value !== null)

    const levels = issueTypeLevels(input.issues)
    const repairedStatuses = repairEntities<JiraStatus>(
      "status",
      "Unknown status",
      uniqueBy(
        input.statuses.flatMap(({ statuses }) => statuses),
        ({ id }) => id
      ),
      input.issues.map((issue) => ({
        issueKey: issue.key,
        value: issue.fields.status,
        required: true
      })),
      (id, name, reference) => ({
        id,
        name,
        ...(reference?.statusCategory === undefined
          ? {}
          : { statusCategory: reference.statusCategory })
      })
    )
    const repairedIssueTypes = repairEntities(
      "issue type",
      "Unknown issue type",
      uniqueBy(
        input.statuses.map(({ statuses: _statuses, ...issueType }) => ({
          ...issueType,
          hierarchyLevel:
            levels.get(issueType.id) ?? (issueType.subtask === true ? -1 : null)
        })),
        ({ id }) => id
      ),
      input.issues.map((issue) => ({
        issueKey: issue.key,
        value: issue.fields.issuetype,
        required: true
      })),
      (id, name, reference) => ({
        id,
        name,
        subtask: reference?.subtask ?? false,
        hierarchyLevel:
          reference?.hierarchyLevel ?? (reference?.subtask === true ? -1 : null)
      })
    )
    const repairedPriorities = repairEntities<JiraPriority>(
      "priority",
      "Unknown priority",
      input.priorities,
      input.issues.map((issue) => ({
        issueKey: issue.key,
        value: issue.fields.priority,
        required: false
      })),
      (id, name) => ({ id, name })
    )
    const repairedComponents = repairEntities<JiraComponent>(
      "component",
      "Unknown component",
      input.components,
      input.issues.flatMap((issue) =>
        (issue.fields.components ?? []).map((value) => ({
          issueKey: issue.key,
          value,
          required: false
        }))
      ),
      (id, name) => ({ id, name })
    )
    const repairedVersions = repairEntities<JiraVersion>(
      "version",
      "Unknown version",
      input.versions,
      input.issues.flatMap((issue) =>
        (issue.fields.fixVersions ?? []).map((value) => ({
          issueKey: issue.key,
          value,
          required: false
        }))
      ),
      (id, name) => ({ id, name })
    )
    const statuses = repairedStatuses.entities
    const issueTypes = repairedIssueTypes.entities
    const priorities = repairedPriorities.entities
    const components = repairedComponents.entities
    const versions = repairedVersions.entities
    const repairs = [
      ...repairedStatuses.findings,
      ...repairedIssueTypes.findings,
      ...repairedPriorities.findings,
      ...repairedComponents.findings,
      ...repairedVersions.findings
    ]
    const issueTypesById = new Map(issueTypes.map((type) => [type.id, type]))
    const sprintIdsByIssue = groupBy(
      input.sprints.flatMap(({ sprint, issueIds }) =>
        issueIds.map((issueId) => ({ issueId, groupId: `sprint:${sprint.id}` }))
      ),
      ({ issueId }) => issueId,
      ({ groupId }) => groupId
    )
    const issues = input.issues.map((issue) => {
      const fields = issue.fields
      const parentKey = fields.parent?.key
      return {
        id: issue.id,
        key: issue.key,
        issueNumber: issueNumber(issue.key),
        summary: fields.summary ?? issue.key,
        description: convertedText(fields.description),
        statusId: fields.status?.id ?? UNKNOWN_SOURCE_ENTITY_ID,
        issueTypeId: fields.issuetype?.id ?? UNKNOWN_SOURCE_ENTITY_ID,
        priorityId: fields.priority?.id ?? null,
        assigneeAccountId: fields.assignee?.accountId ?? null,
        labels: fields.labels ?? [],
        componentIds: (fields.components ?? []).map(({ id }) => id),
        groupIds: [
          ...(fields.fixVersions ?? []).map(({ id }) => `version:${id}`),
          ...(sprintIdsByIssue.get(issue.id) ?? [])
        ],
        parentIssueId: fields.parent?.id ?? null,
        parentIssueKey: Predicate.isString(parentKey) ? parentKey : null,
        attachmentIds: (fields.attachment ?? []).map(({ id }) => id),
        restricted: fields.security !== null && fields.security !== undefined,
        createdAt: fields.created ?? DateTime.formatIso(input.scannedAt),
        updatedAt: fields.updated ?? DateTime.formatIso(input.scannedAt),
        raw: issue
      }
    })
    const comments = input.issues.flatMap((issue) =>
      (input.commentsByIssue[issue.id] ?? []).map((comment) => ({
        id: comment.id,
        issueId: issue.id,
        authorAccountId: comment.author.accountId,
        authorDisplayName: comment.author.displayName,
        body: convertedText(comment.body) ?? {
          markdown: "",
          warnings: [],
          references: [],
          adf: comment.body
        },
        createdAt: comment.created,
        updatedAt: comment.updated ?? null,
        restricted: comment.visibility !== undefined,
        raw: comment
      }))
    )
    const attachments = input.issues.flatMap((issue) =>
      (issue.fields.attachment ?? []).flatMap((attachment) => {
        const { id, filename } = attachment
        if (!id || !filename) return []
        return [
          {
            id,
            issueId: issue.id,
            filename,
            mimeType: attachment.mimeType ?? "application/octet-stream",
            byteSize: attachment.size ?? 0,
            downloadUrl: attachment.content ?? null,
            jiraUrl: attachment.self ?? null,
            downloadAllowed: (attachment.content ?? null) !== null,
            raw: attachment
          }
        ]
      })
    )
    const restrictedWorklogs = Object.entries(input.worklogsByIssue).flatMap(
      ([issueId, worklogs]) =>
        worklogs
          .filter(({ visibility }) => visibility !== undefined)
          .map((worklog) => ({ issueId, worklog }))
    )
    const restrictions = [
      ...issues
        .filter(({ restricted }) => restricted)
        .map((issue) => ({
          id: `issue:${issue.id}`,
          targetKind: "issue" as const,
          targetId: issue.id,
          source: "issue-security",
          raw: issue.raw
        })),
      ...comments
        .filter(({ restricted }) => restricted)
        .map((comment) => ({
          id: `comment:${comment.id}`,
          targetKind: "comment" as const,
          targetId: comment.id,
          source: "comment-visibility",
          raw: comment.raw
        })),
      ...restrictedWorklogs.map(({ issueId, worklog }) => ({
        id: `worklog:${worklog.id}`,
        targetKind: "worklog" as const,
        targetId: worklog.id,
        source: "worklog-visibility",
        raw: { issueId, worklog }
      }))
    ]
    const scannedIssueIds = new Set(issues.map(({ id }) => id))
    const issueIdsByGroup = groupBy(
      issues.flatMap((issue) =>
        [
          ...issue.groupIds.filter((id) => id.startsWith("version:")),
          ...(issue.parentIssueId === null
            ? []
            : [`epic:${issue.parentIssueId}`])
        ].map((groupId) => ({ groupId, issueId: issue.id }))
      ),
      ({ groupId }) => groupId,
      ({ issueId }) => issueId
    )
    const manifestRaw = {
      version: 1,
      migrationId: input.migrationId,
      source: {
        cloudId: input.cloudId,
        siteUrl: input.siteUrl,
        projectId: input.project.id,
        projectKey: input.project.key,
        projectName: input.project.name,
        productType: input.project.projectTypeKey ?? null,
        scannedAt: DateTime.formatIso(input.scannedAt),
        description: convertedText(input.project.description),
        raw: input.project
      },
      identities: uniqueBy(identities, ({ accountId }) => accountId),
      statuses: statuses.map((status) => ({
        id: status.id,
        name: status.name,
        categoryKey: status.statusCategory?.key ?? null,
        raw: status
      })),
      issueTypes: issueTypes.map((issueType) => ({
        id: issueType.id,
        name: issueType.name,
        subtask: issueType.subtask ?? false,
        hierarchyLevel: issueType.hierarchyLevel,
        raw: issueType
      })),
      priorities: priorities.map((priority) => ({
        id: priority.id,
        name: priority.name,
        raw: priority
      })),
      components: components.map((component) => ({
        id: component.id,
        name: component.name,
        description: component.description ?? null,
        raw: component
      })),
      issues,
      comments,
      attachments,
      groups: [
        ...versions.map((version) => ({
          id: `version:${version.id}`,
          kind: "milestone" as const,
          name: version.name,
          description: version.description ?? null,
          state: version.released
            ? ("completed" as const)
            : ("future" as const),
          issueIds: issueIdsByGroup.get(`version:${version.id}`) ?? [],
          startsAt: version.startDate ?? null,
          endsAt: version.releaseDate ?? null,
          completedAt: version.released ? (version.releaseDate ?? null) : null,
          raw: version
        })),
        ...input.sprints.map(({ sprint, issueIds }) => ({
          id: `sprint:${sprint.id}`,
          kind: "sprint" as const,
          name: sprint.name,
          description: sprint.goal ?? null,
          state: ["closed", "complete", "completed"].includes(
            sprint.state.toLowerCase()
          )
            ? ("completed" as const)
            : sprint.state.toLowerCase() === "active"
              ? ("active" as const)
              : sprint.state.toLowerCase() === "future"
                ? ("future" as const)
                : ("other" as const),
          issueIds: issueIds.filter((issueId) => scannedIssueIds.has(issueId)),
          startsAt: sprint.startDate ?? null,
          endsAt: sprint.endDate ?? null,
          completedAt: sprint.completeDate ?? null,
          raw: sprint
        })),
        ...issues
          .filter((issue) => {
            const type = issueTypesById.get(issue.issueTypeId)
            return type !== undefined && isJiraEpicLevel(type)
          })
          .map((epic) => ({
            id: `epic:${epic.id}`,
            kind: "epic" as const,
            name: epic.summary,
            description: epic.description?.markdown ?? null,
            state: null,
            issueIds: issueIdsByGroup.get(`epic:${epic.id}`) ?? [],
            startsAt: null,
            endsAt: null,
            completedAt: null,
            raw: epic.raw
          }))
      ],
      restrictions,
      coverage: [
        {
          category: "issues",
          visibility: "visible-only",
          reason: "jira-permissions"
        },
        {
          category: "comments",
          visibility: "visible-only",
          reason: "jira-permissions"
        },
        {
          category: "worklogs",
          visibility: "visible-only",
          reason: "jira-permissions"
        }
      ],
      rawPages: [
        { kind: "issues", cursor: null, records: input.issues },
        {
          kind: "comments",
          cursor: null,
          records: Object.values(input.commentsByIssue).flat()
        },
        {
          kind: "worklogs",
          cursor: null,
          records: Object.values(input.worklogsByIssue).flat()
        }
      ]
    }
    const manifest = normalizeJiraManifest(
      yield* decodeUnknownJiraMigrationManifest(manifestRaw)
    )
    const tags = buildTagCandidates(manifest)
    const collisions = new Map(
      findTagCollisions(tags).flatMap((collision) =>
        collision.sourceIds.map((id) => [id, collision.sourceIds] as const)
      )
    )
    const identityOptions = input.identityOptions.map((option) =>
      option.name.length === 0 ? { ...option, name: option.email } : option
    )
    const statusCreateOptions = new Map(
      buildJiraStatusCreateOptions(manifest.statuses).map((candidate) => [
        candidate.sourceStatusId,
        candidate.createOption
      ])
    )
    const issuesByStatus = countBy(manifest.issues.map((x) => x.statusId))
    const issuesByType = countBy(manifest.issues.map((x) => x.issueTypeId))
    const issuesByPriority = countBy(
      manifest.issues.flatMap((x) =>
        x.priorityId === null ? [] : [x.priorityId]
      )
    )
    const issuesByTag = countBy(
      manifest.issues.flatMap((issue) => [
        ...new Set([
          ...issue.labels.map((label) => `label:${label}`),
          ...issue.componentIds.map((id) => `component:${id}`)
        ])
      ])
    )
    const suggestedTypes = new Map(
      manifest.issueTypes.map((issueType) => [
        issueType.id,
        suggestedIssueType(issueType.name, issueType.hierarchyLevel ?? null)
      ])
    )
    const hierarchy = resolveJiraHierarchy(manifest, {
      issueTypes: [...suggestedTypes].map(
        ([sourceIssueTypeId, destinationType]) => ({
          sourceIssueTypeId,
          destinationType
        })
      ),
      restrictions: []
    })
    const requirements = yield* decodeUnknownJiraMigrationRequirements({
      destination: {
        suggestedName: input.project.name,
        suggestedSlug: suggestedSlug(input.project.name),
        suggestedKey: suggestedKey(input.project.key, input.project.name)
      },
      identities: manifest.identities.map((identity) => ({
        jiraAccountId: identity.accountId,
        displayName: identity.displayName,
        email: identity.emailAddress,
        suggestedProjectProjectUserId:
          identityOptions.find(
            ({ email }) =>
              identity.emailAddress !== null &&
              email.toLowerCase() === identity.emailAddress.toLowerCase()
          )?.id ?? null
      })),
      identityOptions,
      statuses: manifest.statuses.map((status) => ({
        jiraStatusId: status.id,
        name: status.name,
        categoryKey: status.categoryKey,
        suggestedProjectStatusSlug:
          status.categoryKey === "done"
            ? "done"
            : status.categoryKey === "indeterminate" ||
                status.name.toLowerCase().includes("progress")
              ? "in_progress"
              : "todo",
        createOption: statusCreateOptions.get(status.id) ?? null,
        issueCount: issuesByStatus.get(status.id) ?? 0
      })),
      statusOptions: [
        {
          slug: "todo",
          label: "Todo",
          icon: "CircleDashed",
          color: "#a3a3a3",
          isTerminal: false
        },
        {
          slug: "in_progress",
          label: "In progress",
          icon: "CircleDot",
          color: "#3b82f6",
          isTerminal: false
        },
        {
          slug: "done",
          label: "Done",
          icon: "CircleCheck",
          color: "#22c55e",
          isTerminal: true
        }
      ],
      issueTypes: manifest.issueTypes.map((issueType) => ({
        jiraIssueTypeId: issueType.id,
        name: issueType.name,
        isSubtask: issueType.subtask,
        suggestedProjectType: suggestedTypes.get(issueType.id) ?? null,
        issueCount: issuesByType.get(issueType.id) ?? 0
      })),
      priorities: manifest.priorities.map((priority) => ({
        jiraPriorityId: priority.id,
        name: priority.name,
        suggestedProjectPriority: suggestedPriority(priority.name),
        issueCount: issuesByPriority.get(priority.id) ?? 0
      })),
      tags: tags.map((tag) => ({
        source: { kind: tag.sourceKind, value: tag.sourceValue },
        suggestedDestinationTagName: tag.destinationTag,
        collisionSourceValues: (collisions.get(tag.sourceId) ?? [])
          .filter((id) => id !== tag.sourceId)
          .map(
            (id) =>
              tags.find((candidate) => candidate.sourceId === id)
                ?.sourceValue ?? id
          ),
        issueCount: issuesByTag.get(tag.sourceId) ?? 0
      })),
      activeFutureSprintChoices: buildOpenSprintConflicts(manifest).map(
        (conflict) => {
          const issue = manifest.issues.find(
            ({ id }) => id === conflict.sourceIssueId
          )
          return {
            jiraIssueId: conflict.sourceIssueId,
            issueKey: issue?.key ?? conflict.sourceIssueId,
            issueSummary: issue?.summary ?? conflict.sourceIssueId,
            options: conflict.candidateGroupIds.flatMap((id) => {
              const group = manifest.groups.find(
                (candidate) => candidate.id === id
              )
              return group &&
                (group.state === "active" || group.state === "future")
                ? [{ jiraSprintId: id, name: group.name, state: group.state }]
                : []
            })
          }
        }
      ),
      restrictedContent: {
        issueCount: manifest.restrictions.filter(
          ({ targetKind }) => targetKind === "issue"
        ).length,
        commentCount: manifest.restrictions.filter(
          ({ targetKind }) => targetKind === "comment"
        ).length,
        worklogCount: manifest.restrictions.filter(
          ({ targetKind }) => targetKind === "worklog"
        ).length,
        issues: manifest.issues
          .filter(({ restricted }) => restricted)
          .map((issue) => ({
            jiraIssueId: issue.id,
            issueKey: issue.key,
            issueSummary: issue.summary,
            childIssueKeys: manifest.issues
              .filter(({ parentIssueId }) => parentIssueId === issue.id)
              .map(({ key }) => key)
          }))
      },
      attachments: manifest.attachments.map((attachment) => ({
        jiraAttachmentId: attachment.id,
        filename: attachment.filename,
        byteSize: attachment.byteSize,
        forcedSkipReason:
          !attachment.downloadAllowed || attachment.downloadUrl === null
            ? "unavailable"
            : attachment.byteSize <= 0 ||
                attachment.byteSize > ATTACHMENT_MAX_BYTES
              ? "too_large"
              : !isAllowedAttachmentContentType(attachment.mimeType)
                ? "unsupported_type"
                : null
      }))
    })
    const counts = {
      identities: manifest.identities.length,
      statuses: manifest.statuses.length,
      issueTypes: manifest.issueTypes.length,
      priorities: manifest.priorities.length,
      tags: tags.length,
      issues: manifest.issues.length,
      comments: manifest.comments.length,
      attachments: manifest.attachments.length,
      groups: manifest.groups.length,
      sprints: manifest.groups.filter(({ kind }) => kind === "sprint").length,
      restrictions: manifest.restrictions.length,
      epics: manifest.issues.filter((issue) =>
        isEpicType(suggestedTypes.get(issue.issueTypeId))
      ).length,
      subTickets: hierarchy.parents.size
    }
    const summary = {
      siteName: input.siteName,
      siteUrl: input.siteUrl,
      projectName: input.project.name,
      projectKey: input.project.key,
      scannedAt: input.scannedAt,
      counts,
      visibilityWarnings: manifest.coverage
        .filter(({ visibility }) => isCoverageLimited(visibility))
        .map(({ category, reason }) => ({
          category,
          label: category,
          detail: reason
        }))
    } satisfies JiraMigrationScanSummary
    return { manifest, requirements, summary, repairs }
  })

export const ISSUE_DEPENDENT_CONCURRENCY = 4
export type JiraScanCollectionInput = Omit<
  JiraScanPageInput,
  "cursor" | "pageOrdinal" | "operationTry"
>
export const scanCollection = <E, R>(
  input: JiraScanCollectionInput,
  run: (input: JiraScanPageInput) => Effect.Effect<JiraScanPageResult, E, R>
) =>
  Stream.paginate(
    { cursor: null as string | null, pageOrdinal: 0, seen: new Set<string>() },
    Effect.fn(function* (state) {
      const page = yield* run({
        ...input,
        cursor: state.cursor,
        pageOrdinal: state.pageOrdinal,
        operationTry: 0
      })
      if (page.nextCursor === null) return [[page], Option.none()] as const
      if (page.nextCursor === state.cursor || state.seen.has(page.nextCursor))
        return yield* scanFailure("jira_migration_repeated_cursor")
      return [
        [page],
        Option.some({
          cursor: page.nextCursor,
          pageOrdinal: state.pageOrdinal + 1,
          seen: new Set([...state.seen, page.nextCursor])
        })
      ] as const
    })
  ).pipe(Stream.runCollect)
