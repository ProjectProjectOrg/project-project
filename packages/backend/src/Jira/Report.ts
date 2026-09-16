import type { JiraMigrationMappings } from "./Mappings"
import type { JiraMigrationManifest } from "./Manifest"
import type { JiraPreflightResult } from "./Preflight"
import type { JiraPublicationPlan } from "./PublicationPlan"

export interface JiraMigrationOutcomeInput {
  readonly migrationId: string
  readonly orgSlug: string
  readonly siteName: string
  readonly manifest: JiraMigrationManifest
  readonly mappings: JiraMigrationMappings
  readonly preflight: JiraPreflightResult
  readonly plan: JiraPublicationPlan
  readonly copiedAttachmentIds: ReadonlyArray<string>
  readonly userLabelsById: Readonly<Record<string, string>>
  readonly completedAt: string
}

const restrictionPolicy = (mappings: JiraMigrationMappings) =>
  mappings.restrictions.some(
    ({ resolution }) => resolution === "include_acknowledged"
  )
    ? "include_acknowledged"
    : "exclude"

const excludedRestrictionTargets = (input: JiraMigrationOutcomeInput) => {
  const decisions = new Map(
    input.mappings.restrictions.map(({ restrictionId, resolution }) => [
      restrictionId,
      resolution
    ])
  )
  const targets = {
    issue: new Set<string>(),
    comment: new Set<string>(),
    worklog: new Set<string>()
  }
  for (const restriction of input.manifest.restrictions) {
    if (decisions.get(restriction.id) !== "exclude") continue
    targets[restriction.targetKind].add(restriction.targetId)
  }
  return targets
}

const adfWarningCounts = (manifest: JiraMigrationManifest) => {
  const counts = new Map<string, number>()
  const add = (nodeType: string) =>
    counts.set(nodeType, (counts.get(nodeType) ?? 0) + 1)
  for (const issue of manifest.issues) {
    for (const warning of issue.description?.warnings ?? [])
      add(warning.nodeType)
  }
  for (const comment of manifest.comments) {
    for (const warning of comment.body.warnings) add(warning.nodeType)
  }
  for (const warning of manifest.source.description?.warnings ?? []) {
    add(warning.nodeType)
  }
  return [...counts.entries()].toSorted(
    (left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : 1)
  )
}

export function buildJiraMigrationArchive(input: JiraMigrationOutcomeInput) {
  const excluded = excludedRestrictionTargets(input)
  const keepIssue = (issueId: string) => !excluded.issue.has(issueId)
  return {
    version: 1,
    migrationId: input.migrationId,
    generatedAt: input.completedAt,
    restrictionPolicy: restrictionPolicy(input.mappings),
    destination: {
      orgSlug: input.orgSlug,
      projectSlug: input.plan.project.slug,
      projectKey: input.plan.project.key,
      projectName: input.plan.project.name
    },
    decisions: input.mappings,
    preflight: {
      warnings: input.preflight.warnings,
      attachments: input.preflight.attachments
    },
    outcome: {
      tickets: input.plan.tickets.map(
        ({ sourceIssueKey, sourceIssueId, id, status, type, priority }) => ({
          sourceIssueKey,
          sourceIssueId,
          ticketId: id,
          status,
          type,
          priority
        })
      ),
      groups: input.plan.groups.map(({ sourceGroupId, kind, name }) => ({
        sourceGroupId,
        kind,
        name
      })),
      createdStatuses: input.plan.createdStatuses,
      tags: input.plan.tags,
      copiedAttachmentIds: input.copiedAttachmentIds
    },
    source: {
      ...input.manifest,
      issues: input.manifest.issues.filter(({ id }) => keepIssue(id)),
      comments: input.manifest.comments.filter(
        ({ id, issueId }) => !excluded.comment.has(id) && keepIssue(issueId)
      ),
      attachments: input.manifest.attachments.filter(({ issueId }) =>
        keepIssue(issueId)
      ),
      rawPages: input.manifest.rawPages.filter(
        ({ kind }) => kind !== "worklogs"
      )
    }
  }
}

const table = (
  headers: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<string>>
) =>
  rows.length === 0
    ? "_None._"
    : [
        `| ${headers.join(" | ")} |`,
        `| ${headers.map(() => "---").join(" | ")} |`,
        ...rows.map((row) => `| ${row.join(" | ")} |`)
      ].join("\n")

const escapeCell = (value: string) => value.replace(/\|/g, "\\|")

const bytes = (value: number) =>
  value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(value / 1024))} KB`

export function buildJiraMigrationReportMarkdown(
  input: JiraMigrationOutcomeInput
): string {
  const { manifest, mappings, plan, preflight } = input
  const statusNames = new Map(
    manifest.statuses.map(({ id, name }) => [id, name])
  )
  const typeNames = new Map(
    manifest.issueTypes.map(({ id, name }) => [id, name])
  )
  const priorityNames = new Map(
    manifest.priorities.map(({ id, name }) => [id, name])
  )
  const identityNames = new Map(
    manifest.identities.map(({ accountId, displayName }) => [
      accountId,
      displayName
    ])
  )
  const attachmentsById = new Map(
    manifest.attachments.map((attachment) => [attachment.id, attachment])
  )
  const createdStatusSlugs = new Set(
    plan.createdStatuses.map(({ slug }) => slug)
  )
  const excluded = excludedRestrictionTargets(input)
  const groupsByKind = (kind: JiraPublicationPlan["groups"][number]["kind"]) =>
    plan.groups.filter((group) => group.kind === kind).length

  const skippedAttachments = preflight.attachments.filter(
    ({ action }) => action === "skip"
  )
  const degradedNodes = adfWarningCounts(manifest)
  const crossProjectLinks = manifest.issues
    .flatMap((issue) => issue.description?.references ?? [])
    .concat(manifest.comments.flatMap((comment) => comment.body.references))
    .filter(
      (reference) =>
        reference.kind === "jira-issue" &&
        !manifest.issues.some(({ id }) => id === reference.sourceId)
    ).length

  return `# Jira migration report — ${plan.project.name}

- **Migration** \`${input.migrationId}\`
- **Source** ${input.siteName} · \`${manifest.source.projectKey}\` ${manifest.source.projectName}
- **Product type** ${manifest.source.productType ?? "unknown"}
- **Scanned** ${manifest.source.scannedAt}
- **Completed** ${input.completedAt}
- **Destination** \`${input.orgSlug}/${plan.project.slug}\` (key \`${plan.project.key}\`)

Everything below describes data **visible to the Jira account that ran this migration**. A
permission-filtered scan cannot be read as a complete export of the Jira project.

## Migrated

${table(
  ["Record", "Count"],
  [
    ["Tickets", `${plan.tickets.length}`],
    ["Comments", `${plan.comments.length}`],
    ["Epic groups", `${groupsByKind("epic")}`],
    ["Milestone groups", `${groupsByKind("milestone")}`],
    ["Sprint groups", `${groupsByKind("sprint")}`],
    ["Tags", `${plan.tags.length}`],
    ["Statuses created", `${plan.createdStatuses.length}`],
    ["Attachments copied", `${input.copiedAttachmentIds.length}`]
  ]
)}

## Mapping decisions

### Statuses

${table(
  ["Jira status", "Destination", "Created"],
  mappings.statuses.map(({ sourceStatusId, destinationStatusSlug }) => [
    escapeCell(statusNames.get(sourceStatusId) ?? sourceStatusId),
    `\`${destinationStatusSlug}\``,
    createdStatusSlugs.has(destinationStatusSlug) ? "yes" : "no"
  ])
)}

### Issue types

${table(
  ["Jira type", "Destination"],
  mappings.issueTypes.map(({ sourceIssueTypeId, destinationType }) => [
    escapeCell(typeNames.get(sourceIssueTypeId) ?? sourceIssueTypeId),
    `\`${destinationType}\``
  ])
)}

### Priorities

${table(
  ["Jira priority", "Destination"],
  mappings.priorities.map(({ sourcePriorityId, destinationPriority }) => [
    escapeCell(
      sourcePriorityId === null
        ? "(none)"
        : (priorityNames.get(sourcePriorityId) ?? sourcePriorityId)
    ),
    `\`${destinationPriority}\``
  ])
)}

### People

${table(
  ["Jira account", "Linked to"],
  mappings.identities.map(({ sourceAccountId, resolution }) => [
    escapeCell(identityNames.get(sourceAccountId) ?? sourceAccountId),
    resolution.kind === "link"
      ? escapeCell(input.userLabelsById[resolution.userId] ?? resolution.userId)
      : "_not linked_"
  ])
)}

Work by unlinked accounts keeps its original Jira display name on comments and is
preserved in the archive. No placeholder accounts were created.

### Tags

${table(
  ["Tag", "From"],
  plan.tags.map(({ name, sourceIds }) => [
    `\`${escapeCell(name)}\``,
    escapeCell(sourceIds.join(", "))
  ])
)}

## Not migrated

### Attachments skipped

${table(
  ["File", "Size", "Reason"],
  skippedAttachments.map(({ sourceAttachmentId, reason }) => {
    const attachment = attachmentsById.get(sourceAttachmentId)
    return [
      escapeCell(attachment?.filename ?? sourceAttachmentId),
      attachment ? bytes(attachment.byteSize) : "unknown",
      reason ?? "unknown"
    ]
  })
)}

### Restricted content

Policy: **${restrictionPolicy(mappings) === "exclude" ? "excluded and reported" : "included after acknowledgement"}**.

${table(
  ["Kind", "Detected", "Excluded"],
  [
    [
      "Issues",
      `${manifest.restrictions.filter(({ targetKind }) => targetKind === "issue").length}`,
      `${excluded.issue.size}`
    ],
    [
      "Comments",
      `${manifest.restrictions.filter(({ targetKind }) => targetKind === "comment").length}`,
      `${excluded.comment.size}`
    ],
    [
      "Worklogs",
      `${manifest.restrictions.filter(({ targetKind }) => targetKind === "worklog").length}`,
      `${excluded.worklog.size}`
    ]
  ]
)}

### Rich text degraded during conversion

${table(
  ["ADF node", "Occurrences"],
  degradedNodes.map(([nodeType, count]) => [`\`${nodeType}\``, `${count}`])
)}

### Kept in the archive only

Custom fields, workflow metadata, changelogs, worklogs, watchers, voters, issue links and
parent/subtask hierarchy have no native ProjectProject model. Their original Jira JSON is
retained beside this report in \`${plan.archivePath}/archive.json\`.

## Coverage

${table(
  ["Category", "Visibility", "Reason"],
  manifest.coverage.map(({ category, visibility, reason }) => [
    escapeCell(category),
    visibility,
    escapeCell(reason ?? "—")
  ])
)}

${
  crossProjectLinks === 0
    ? "All migrated issue links resolved to this project."
    : `${crossProjectLinks} link${crossProjectLinks === 1 ? "" : "s"} pointed outside the migrated project and still target Jira.`
}

${
  preflight.warnings.length === 0
    ? ""
    : `## Warnings\n\n${table(
        ["Code", "Subject", "Detail"],
        preflight.warnings.map(({ code, subjectId, detail }) => [
          `\`${code}\``,
          escapeCell(subjectId),
          escapeCell(detail ?? "—")
        ])
      )}\n`
}`
}
