import { createHash } from "node:crypto"

import {
  ATTACHMENT_MAX_BYTES,
  attachmentUploadContentType,
  isAllowedAttachmentContentType,
  type JiraSkippedAttachment
} from "@pp/shared"
import { Option, Predicate, Schema } from "effect"

import type { JiraMigrationManifest } from "./Manifest"
import {
  JiraConvertedText as ArchivedConvertedText,
  JiraManifestSourceV2,
  canonicalJiraJson
} from "./Manifest"
import { jiraRestrictionPolicy, type JiraMigrationMappings } from "./Mappings"
import type { JiraPreflightResult } from "./Preflight"
import type { JiraPublicationPlan } from "./PublicationPlan"
import type {
  JiraPreparedPublicationV1,
  JiraAttachmentOutcome
} from "./PublicationPlan"
export type JiraMigrationOutcomeInput = Readonly<{
  migrationId: string
  orgSlug: string
  siteName: string
  manifest: JiraMigrationManifest
  mappings: JiraMigrationMappings
  preflight: JiraPreflightResult
  plan: JiraPublicationPlan
  copiedAttachmentIds: ReadonlyArray<string>
  userLabelsById: Readonly<Record<string, string>>
  completedAt: string
}>

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

const ArchiveExclusion = Schema.Struct({
  sourceId: Schema.String,
  category: Schema.String,
  restrictionSource: Schema.String,
  contentSha256: Schema.String,
  excludedReason: Schema.String
})
export const JiraPlannedArchive = Schema.Struct({
  version: Schema.Literal(1),
  manifestVersion: Schema.Literal(2),
  migrationId: Schema.String,
  source: Schema.JsonObject,
  restrictionPolicy: Schema.Literals(["exclude", "include"]),
  categories: Schema.Record(Schema.String, Schema.Array(Schema.Json)),
  exclusions: Schema.Array(ArchiveExclusion),
  mappings: Schema.JsonObject,
  attachmentOutcomes: Schema.Array(Schema.Json),
  schemaVersions: Schema.Array(Schema.Json),
  converterVersions: Schema.Array(Schema.Json)
})

const ArchivedIssueLink = Schema.Struct({
  id: Schema.NonEmptyString,
  key: Schema.NonEmptyString
})

const ArchivedAttachmentLink = Schema.Struct({
  id: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  filename: Schema.NonEmptyString,
  mimeType: Schema.NonEmptyString,
  byteSize: Schema.Int
})

const ArchivedSkippedOutcome = Schema.Struct({
  sourceAttachmentId: Schema.NonEmptyString,
  kind: Schema.Literal("skipped")
})

export const skippedAttachmentsForArchive = (
  archive: typeof JiraPlannedArchive.Type,
  destination: Readonly<{
    orgSlug: string
    projectSlug: string
    siteUrl: string
  }>
): ReadonlyArray<JiraSkippedAttachment> => {
  const site = new URL(destination.siteUrl)
  if (site.protocol !== "https:") throw new Error("Invalid Jira site URL")
  const issues = archive.categories.issues ?? []
  const attachments = archive.categories.attachments ?? []
  return archive.attachmentOutcomes
    .filter(Schema.is(ArchivedSkippedOutcome))
    .map((outcome) => {
      const attachment = Schema.decodeUnknownSync(ArchivedAttachmentLink)(
        attachments.find(
          (item) =>
            Predicate.isObject(item) && item.id === outcome.sourceAttachmentId
        )
      )
      const issue = Schema.decodeUnknownSync(ArchivedIssueLink)(
        issues.find(
          (item) => Predicate.isObject(item) && item.id === attachment.issueId
        )
      )
      const contentType = attachmentUploadContentType(
        attachment.filename,
        attachment.mimeType
      )
      const replacement = !isAllowedAttachmentContentType(contentType)
        ? "unsupported_type"
        : attachment.byteSize <= 0 || attachment.byteSize > ATTACHMENT_MAX_BYTES
          ? "too_large"
          : "available"
      return {
        sourceAttachmentId: outcome.sourceAttachmentId,
        filename: attachment.filename,
        sourceIssueKey: issue.key,
        targetTicketId: issue.key,
        sourceIssueUrl: new URL(
          `browse/${encodeURIComponent(issue.key)}`,
          `${site.origin}/`
        ).href,
        targetTicketUrl: `/orgs/${encodeURIComponent(destination.orgSlug)}/projects/${encodeURIComponent(destination.projectSlug)}/tickets/${encodeURIComponent(issue.key)}`,
        replacement
      }
    })
}
export const JiraPlannedReport = Schema.Struct({
  version: Schema.Literal(1),
  partialSuccess: Schema.Boolean,
  nativeCounts: Schema.Record(Schema.String, Schema.Int),
  archivedCounts: Schema.Record(Schema.String, Schema.Int),
  markdown: Schema.String
})
const CustomFieldValues = Schema.Array(
  Schema.Struct({ issueId: Schema.NonEmptyString, value: Schema.Json })
)

export function buildJiraArchiveV2(
  prepared: JiraPreparedPublicationV1,
  outcomes: ReadonlyArray<JiraAttachmentOutcome>
) {
  const manifest = prepared.manifest
  const exclude = jiraRestrictionPolicy(prepared.configuration) === "exclude"
  const restriction = (kind: string, id: string) =>
    exclude
      ? manifest.restrictions.find(
          (x) => x.targetKind === kind && x.targetId === id
        )
      : undefined
  const excludedIssue = (id: string) => restriction("issue", id)
  const values = new Map(
    prepared.source.artifacts.map((x) => [x.ref.key, x.value])
  )
  const exclusions: Array<typeof ArchiveExclusion.Type> = []
  const tombstone = (
    category: string,
    sourceId: string,
    restrictionSource: string,
    content: Schema.Json,
    excludedReason = "excluded_by_user"
  ) => {
    const row = {
      sourceId,
      category,
      restrictionSource,
      contentSha256: createHash("sha256")
        .update(canonicalJiraJson(content))
        .digest("hex"),
      excludedReason
    }
    exclusions.push(row)
    return row
  }
  const categories: Record<string, ReadonlyArray<Schema.Json>> = {}
  categories.issues = manifest.issues.map(
    ({ descriptionArtifact, ...issue }) => {
      const description =
        descriptionArtifact === null
          ? null
          : values.get(descriptionArtifact.key)!
      const restricted = excludedIssue(issue.id)
      return restricted
        ? tombstone("issues", issue.id, restricted.source, {
            ...issue,
            description
          })
        : { ...issue, description }
    }
  )
  categories.comments = manifest.comments.map(
    ({ bodyArtifact, ...comment }) => {
      const body = values.get(bodyArtifact.key)!
      const restricted =
        restriction("comment", comment.id) ?? excludedIssue(comment.issueId)
      return restricted
        ? tombstone("comments", comment.id, restricted.source, {
            ...comment,
            body
          })
        : { ...comment, body }
    }
  )
  categories.worklogs = manifest.worklogs.map(
    ({ bodyArtifact, ...worklog }) => {
      const body = bodyArtifact === null ? null : values.get(bodyArtifact.key)!
      const restricted =
        restriction("worklog", worklog.id) ?? excludedIssue(worklog.issueId)
      return restricted
        ? tombstone("worklogs", worklog.id, restricted.source, {
            ...worklog,
            body
          })
        : { ...worklog, body }
    }
  )
  categories.attachments = manifest.attachments.map(
    ({ metadataArtifact, ...attachment }) => {
      const restricted = excludedIssue(attachment.issueId)
      return restricted
        ? tombstone("attachments", attachment.id, restricted.source, attachment)
        : {
            ...attachment,
            ...(exclude ? {} : { raw: values.get(metadataArtifact.key)! })
          }
    }
  )
  categories.customFields = manifest.customFields.map(
    ({ valuesArtifact, ...field }) => ({
      ...field,
      values: Schema.decodeUnknownSync(CustomFieldValues)(
        values.get(valuesArtifact.key)
      ).map((value) =>
        excludedIssue(value.issueId)
          ? tombstone(
              "customFields",
              `${field.id}:${value.issueId}`,
              excludedIssue(value.issueId)!.source,
              value
            )
          : value
      )
    })
  )
  const owned = {
    changelogs: manifest.changelogs,
    watchers: manifest.watchers,
    votes: manifest.votes,
    ranks: manifest.ranks
  }
  for (const [category, records] of Object.entries(owned))
    categories[category] = records.map((record) =>
      excludedIssue(record.issueId)
        ? tombstone(
            category,
            record.id,
            excludedIssue(record.issueId)!.source,
            record
          )
        : record
    )
  categories.rawArtifacts = manifest.rawArtifacts.map((ref): Schema.Json => {
    if (!exclude) return { ref, raw: values.get(ref.key)! }
    const row = {
      sourceId: ref.key,
      category: "rawArtifacts",
      restrictionSource: "mixed-envelope",
      contentSha256: ref.sha256,
      excludedReason: "opaque_envelope_content_omitted"
    }
    exclusions.push(row)
    return { ...row, byteSize: ref.byteSize }
  })
  const metadata = {
    fieldDefinitions: manifest.fieldDefinitions,
    workflows: manifest.workflows,
    identities: manifest.identities,
    statuses: manifest.statuses,
    issueTypes: manifest.issueTypes,
    priorities: manifest.priorities,
    components: manifest.components,
    parentsSubtasks: manifest.parentsSubtasks,
    epics: manifest.epics,
    sprints: manifest.sprints,
    versionsReleases: manifest.versionsReleases,
    links: manifest.links,
    restrictions: manifest.restrictions,
    productApps: manifest.productApps,
    coverage: manifest.coverage,
    warnings: manifest.warnings
  }
  for (const [category, records] of Object.entries(metadata))
    categories[category] = records
  return Schema.decodeUnknownSync(JiraPlannedArchive)({
    version: 1,
    manifestVersion: 2,
    migrationId: manifest.migrationId,
    source: {
      ...manifest.source,
      description: prepared.source.projectDescription
    },
    restrictionPolicy: jiraRestrictionPolicy(prepared.configuration),
    categories,
    exclusions: exclusions.toSorted((a, b) =>
      `${a.category}:${a.sourceId}`.localeCompare(
        `${b.category}:${b.sourceId}`,
        "en"
      )
    ),
    mappings: prepared.configuration,
    attachmentOutcomes: outcomes,
    schemaVersions: [
      ...manifest.schemaVersions,
      { id: "archive", version: "1" },
      { id: "publication-plan", version: "1" }
    ],
    converterVersions: manifest.converterVersions
  })
}

export function buildJiraReportV2(
  archive: typeof JiraPlannedArchive.Type,
  nativeCounts: Readonly<Record<string, number>>,
  manualAttachments: ReadonlyArray<
    Readonly<{
      sourceAttachmentId: string
      filename: string
      sourceIssueKey: string
      targetTicketId: string
      sourceIssueUrl: string
      targetTicketUrl: string
    }>
  > = [],
  unresolvedMedia: ReadonlyArray<
    Readonly<{ source: string; mediaId: string; filename: string }>
  > = []
) {
  const archivedCounts = Object.fromEntries(
    Object.entries(archive.categories).map(([category, values]) => [
      category,
      values.length
    ])
  )
  const outcomes = Schema.decodeUnknownSync(
    Schema.Array(Schema.Struct({ kind: Schema.String }))
  )(archive.attachmentOutcomes)
  const coverage = Schema.decodeUnknownSync(
    Schema.Array(
      Schema.Struct({
        category: Schema.String,
        visibility: Schema.String,
        reason: Schema.NullOr(Schema.String)
      })
    )
  )(archive.categories.coverage ?? [])
  const partialSuccess =
    outcomes.some((x) => x.kind !== "copied") ||
    archive.exclusions.some((x) => x.excludedReason === "excluded_by_user") ||
    coverage.some((x) => x.visibility !== "complete") ||
    unresolvedMedia.length > 0
  const decodeTextRecord = Schema.decodeUnknownOption(
    Schema.Struct({
      id: Schema.String,
      description: Schema.optional(Schema.NullOr(ArchivedConvertedText)),
      body: Schema.optional(ArchivedConvertedText)
    })
  )
  const degradation = [
    ...(archive.categories.issues ?? []),
    ...(archive.categories.comments ?? [])
  ].flatMap((record) => {
    const decoded = decodeTextRecord(record)
    if (Option.isNone(decoded)) return []
    return [
      ...(decoded.value.description?.warnings ?? []),
      ...(decoded.value.body?.warnings ?? [])
    ].map((warning) => [decoded.value.id, warning.nodeType, warning.reason])
  })
  const markdown = [
    "# Jira migration report",
    "",
    `Migration: ${archive.migrationId}`,
    canonicalJiraJson(
      Schema.decodeUnknownSync(JiraManifestSourceV2)(archive.source)
    ),
    "Only data visible to the connected Jira account was scanned. Inaccessible data may be absent.",
    "",
    `Partial success: ${partialSuccess ? "yes" : "no"}`,
    `Restriction policy: ${archive.restrictionPolicy}`,
    "",
    "## Native records",
    table(
      ["Category", "Count"],
      Object.entries(nativeCounts).map(([key, count]) => [key, `${count}`])
    ),
    "",
    "## Archived categories",
    table(
      ["Category", "Count"],
      Object.entries(archivedCounts)
        .toSorted(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, count]) => [key, `${count}`])
    ),
    "",
    "## Mapping decisions",
    canonicalJiraJson(archive.mappings),
    "",
    "## Transformations",
    "Subtasks are flattened. Epics, releases, custom fields, links and unsupported products remain archive provenance. Unsupported ADF degrades to readable content; conversion warnings and original allowed ADF are retained with each source record. Source issue-key gaps are preserved.",
    "",
    "## ADF conversion warnings",
    table(["Source", "Node", "Decision"], degradation),
    "",
    "## Attachment outcomes",
    canonicalJiraJson(archive.attachmentOutcomes),
    "",
    ...(unresolvedMedia.length === 0
      ? []
      : [
          "## Embedded files needing attention",
          "These media references could not be matched safely to a copied Jira attachment. Their original text remains in the destination. Open the source issue to locate the file and add it manually if needed.",
          "",
          table(
            ["Source", "File label", "Jira media ID"],
            unresolvedMedia.map(({ source, filename, mediaId }) => [
              escapeCell(source),
              escapeCell(filename),
              escapeCell(mediaId)
            ])
          ),
          ""
        ]),
    ...(manualAttachments.length === 0
      ? []
      : [
          "## Manual attachment replacement",
          "Download each skipped attachment from Jira. Upload it to the destination ticket only if its type is supported and its size is between 1 byte and 25 MB. Otherwise it cannot be replaced in ProjectProject. Update any old Jira link in the ticket text if the new file should appear there.",
          "",
          table(
            [
              "File",
              "Jira issue",
              "ProjectProject ticket",
              "Jira attachment ID"
            ],
            manualAttachments.map((attachment) => [
              escapeCell(attachment.filename),
              `[${escapeCell(attachment.sourceIssueKey)}](${attachment.sourceIssueUrl})`,
              `[${escapeCell(attachment.targetTicketId)}](${attachment.targetTicketUrl})`,
              escapeCell(attachment.sourceAttachmentId)
            ])
          ),
          ""
        ]),
    "## Exclusions and skips",
    table(
      ["Category", "Source", "Reason"],
      archive.exclusions.map((x) => [
        escapeCell(x.category),
        escapeCell(x.sourceId),
        x.excludedReason
      ])
    ),
    "",
    "## Coverage and warnings",
    table(
      ["Category", "Visibility", "Reason"],
      coverage.map((x) => [
        escapeCell(x.category),
        x.visibility,
        escapeCell(x.reason ?? "")
      ])
    ),
    canonicalJiraJson(archive.categories.warnings ?? []),
    "",
    "## Schema and converter versions",
    canonicalJiraJson(archive.schemaVersions),
    canonicalJiraJson(archive.converterVersions)
  ].join("\n")
  return Schema.decodeUnknownSync(JiraPlannedReport)({
    version: 1,
    partialSuccess,
    nativeCounts,
    archivedCounts,
    markdown
  })
}
