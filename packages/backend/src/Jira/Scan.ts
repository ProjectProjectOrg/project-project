import {
  ATTACHMENT_MAX_BYTES,
  JiraMigrationRequirements,
  isAllowedAttachmentContentType,
  type JiraMigrationScanSummary,
  type JiraMigrationUserOption
} from "@projectproject/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { convertAdfToMarkdown } from "./Adf"
import type {
  JiraComment,
  JiraComponent,
  JiraIssue,
  JiraIssueTypeStatuses,
  JiraPriority,
  JiraProject,
  JiraSprint,
  JiraVersion,
  JiraWorklog
} from "./ClientSchemas"
import {
  buildOpenSprintConflicts,
  buildTagCandidates,
  findTagCollisions
} from "./Mappings"
import { JiraMigrationManifest, normalizeJiraManifest } from "./Manifest"

export interface JiraScanInput {
  readonly migrationId: string
  readonly cloudId: string
  readonly siteName: string
  readonly siteUrl: string
  readonly project: JiraProject
  readonly statuses: ReadonlyArray<JiraIssueTypeStatuses>
  readonly priorities: ReadonlyArray<JiraPriority>
  readonly components: ReadonlyArray<JiraComponent>
  readonly versions: ReadonlyArray<JiraVersion>
  readonly issues: ReadonlyArray<JiraIssue>
  readonly commentsByIssue: Readonly<Record<string, ReadonlyArray<JiraComment>>>
  readonly worklogsByIssue: Readonly<Record<string, ReadonlyArray<JiraWorklog>>>
  readonly sprints: ReadonlyArray<{
    readonly sprint: JiraSprint
    readonly issueIds: ReadonlyArray<string>
  }>
  readonly identityOptions: ReadonlyArray<JiraMigrationUserOption>
  readonly scannedAt: DateTime.Utc
}

const record = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null
    ? (value as Readonly<Record<string, unknown>>)
    : {}

const string = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null

const boolean = (value: unknown): boolean | null =>
  typeof value === "boolean" ? value : null

const array = (value: unknown): ReadonlyArray<unknown> =>
  Array.isArray(value) ? value : []

const convertedText = (value: unknown) => {
  if (typeof value === "string") {
    return { markdown: value, warnings: [], references: [], adf: value }
  }
  if (value === null || value === undefined) return null
  const converted = convertAdfToMarkdown(value)
  return { ...converted, adf: value }
}

const userRecord = (value: unknown) => {
  const source = record(value)
  const accountId = string(source.accountId)
  const displayName = string(source.displayName)
  if (!accountId || !displayName) return null
  return {
    accountId,
    displayName,
    emailAddress: string(source.emailAddress),
    active: boolean(source.active),
    accountType: string(source.accountType),
    raw: value
  }
}

const sourceId = (value: unknown): string | null => string(record(value).id)

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

const suggestedIssueType = (name: string) => {
  const lower = name.toLowerCase()
  return lower.includes("bug") || lower.includes("defect")
    ? "bug"
    : lower.includes("task") || lower.includes("chore")
      ? "chore"
      : lower.includes("story") || lower.includes("feature")
        ? "feat"
        : "other"
}

const suggestedPriority = (name: string) => {
  const lower = name.toLowerCase()
  return lower.includes("highest") || lower.includes("high")
    ? "high"
    : lower.includes("lowest") || lower.includes("low")
      ? "low"
      : "med"
}

const uniqueBy = <A>(values: ReadonlyArray<A>, key: (value: A) => string) => [
  ...new Map(values.map((value) => [key(value), value])).values()
]

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

    const statuses = uniqueBy(
      input.statuses.flatMap(({ statuses }) => statuses),
      ({ id }) => id
    )
    const issueTypes = uniqueBy(
      input.statuses.map(({ id, name, subtask }) => ({ id, name, subtask })),
      ({ id }) => id
    )
    const issues = input.issues.map((issue) => {
      const fields = record(issue.fields)
      const status = record(fields.status)
      const issueType = record(fields.issuetype)
      const priority = record(fields.priority)
      const assignee = record(fields.assignee)
      const parent = record(fields.parent)
      return {
        id: issue.id,
        key: issue.key,
        issueNumber: issueNumber(issue.key),
        summary: string(fields.summary) ?? issue.key,
        description: convertedText(fields.description),
        statusId: string(status.id) ?? "unknown",
        issueTypeId: string(issueType.id) ?? "unknown",
        priorityId: string(priority.id),
        assigneeAccountId: string(assignee.accountId),
        labels: array(fields.labels).flatMap((value) =>
          typeof value === "string" ? [value] : []
        ),
        componentIds: array(fields.components).flatMap((value) => {
          const id = sourceId(value)
          return id ? [id] : []
        }),
        groupIds: [
          ...array(fields.fixVersions).flatMap((value) => {
            const id = sourceId(value)
            return id ? [`version:${id}`] : []
          }),
          ...input.sprints.flatMap(({ sprint, issueIds }) =>
            issueIds.includes(issue.id) ? [`sprint:${sprint.id}`] : []
          )
        ],
        parentIssueId: string(parent.id),
        attachmentIds: array(fields.attachment).flatMap((value) => {
          const id = sourceId(value)
          return id ? [id] : []
        }),
        restricted: fields.security !== null && fields.security !== undefined,
        createdAt:
          string(fields.created) ?? DateTime.formatIso(input.scannedAt),
        updatedAt:
          string(fields.updated) ?? DateTime.formatIso(input.scannedAt),
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
      array(issue.fields.attachment).flatMap((value) => {
        const attachment = record(value)
        const id = string(attachment.id)
        const filename = string(attachment.filename)
        if (!id || !filename) return []
        return [
          {
            id,
            issueId: issue.id,
            filename,
            mimeType: string(attachment.mimeType) ?? "application/octet-stream",
            byteSize:
              typeof attachment.size === "number" &&
              Number.isInteger(attachment.size) &&
              attachment.size >= 0
                ? attachment.size
                : 0,
            downloadUrl: string(attachment.content),
            jiraUrl: string(attachment.self),
            downloadAllowed: string(attachment.content) !== null,
            raw: value
          }
        ]
      })
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
        }))
    ]
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
        raw: issueType
      })),
      priorities: input.priorities.map((priority) => ({
        id: priority.id,
        name: priority.name,
        raw: priority
      })),
      components: input.components.map((component) => ({
        id: component.id,
        name: component.name,
        description: component.description ?? null,
        raw: component
      })),
      issues,
      comments,
      attachments,
      groups: [
        ...input.versions.map((version) => ({
          id: `version:${version.id}`,
          kind: "milestone" as const,
          name: version.name,
          description: version.description ?? null,
          state: version.released
            ? ("completed" as const)
            : ("future" as const),
          issueIds: issues
            .filter(({ groupIds }) =>
              groupIds.includes(`version:${version.id}`)
            )
            .map(({ id }) => id),
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
          issueIds,
          startsAt: sprint.startDate ?? null,
          endsAt: sprint.endDate ?? null,
          completedAt: sprint.completeDate ?? null,
          raw: sprint
        })),
        ...issues
          .filter((issue) => {
            const type = issueTypes.find(({ id }) => id === issue.issueTypeId)
            return type?.name.toLowerCase() === "epic"
          })
          .map((epic) => ({
            id: `epic:${epic.id}`,
            kind: "epic" as const,
            name: epic.summary,
            description: epic.description?.markdown ?? null,
            state: null,
            issueIds: issues
              .filter(({ parentIssueId }) => parentIssueId === epic.id)
              .map(({ id }) => id),
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
      yield* Schema.decodeUnknownEffect(JiraMigrationManifest)(manifestRaw)
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
    const requirements = yield* Schema.decodeUnknownEffect(
      JiraMigrationRequirements
    )({
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
            : status.name.toLowerCase().includes("progress")
              ? "in_progress"
              : "todo"
      })),
      statusOptions: [
        { slug: "todo", label: "Todo", isTerminal: false },
        { slug: "in_progress", label: "In progress", isTerminal: false },
        { slug: "done", label: "Done", isTerminal: true }
      ],
      issueTypes: manifest.issueTypes.map((issueType) => ({
        jiraIssueTypeId: issueType.id,
        name: issueType.name,
        isSubtask: issueType.subtask,
        suggestedProjectType: suggestedIssueType(issueType.name)
      })),
      priorities: manifest.priorities.map((priority) => ({
        jiraPriorityId: priority.id,
        name: priority.name,
        suggestedProjectPriority: suggestedPriority(priority.name)
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
          )
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
        ).length
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
      restrictions: manifest.restrictions.length
    }
    const summary = {
      siteName: input.siteName,
      siteUrl: input.siteUrl,
      projectName: input.project.name,
      projectKey: input.project.key,
      scannedAt: input.scannedAt,
      counts,
      visibilityWarnings: manifest.coverage
        .filter(({ visibility }) => visibility !== "complete")
        .map(({ category, reason }) => ({
          category,
          label: category,
          detail: reason
        }))
    } satisfies JiraMigrationScanSummary
    return { manifest, requirements, summary }
  })
