// @effect-diagnostics-next-line nodeBuiltinImport:off
import { createHash } from "node:crypto"

import {
  ATTACHMENT_MAX_BYTES,
  attachmentUploadContentType,
  isAllowedAttachmentContentType,
  type JiraMigrationFinding,
  type JiraSkippedAttachment
} from "@pp/shared"
import { Option, Predicate, Schema } from "effect"

import { rewriteJiraReferences } from "./Adf"
import { countBy } from "./collections"
import { ATTACHMENT_MAX_LABEL, jiraIssueUrl } from "./Findings"
import type { JiraMigrationManifest } from "./Manifest"
import {
  decodeUnknownJiraCustomFieldValuesSync,
  isCoverageLimited,
  JiraConvertedText,
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

const decodeConvertedTextOption = Schema.decodeUnknownOption(JiraConvertedText)

const archivedText = <A extends Schema.Json | null>(value: A): A => {
  const text = decodeConvertedTextOption(value)
  return Option.isSome(text) && Predicate.isObject(value)
    ? (Object.assign({}, value, {
        markdown: rewriteJiraReferences(text.value, new Map()),
        references: text.value.references.map(
          ({ placeholder: _placeholder, ...reference }) => reference
        )
      }) as A)
    : value
}

const decodeUnknownAttachmentOutcomesSync = Schema.decodeUnknownSync(
  Schema.Array(Schema.Struct({ kind: Schema.String }))
)

const decodeUnknownCoverageEntriesSync = Schema.decodeUnknownSync(
  Schema.Array(
    Schema.Struct({
      category: Schema.String,
      visibility: Schema.String,
      reason: Schema.NullOr(Schema.String)
    })
  )
)

const decodeUnknownJiraManifestSourceV2Sync =
  Schema.decodeUnknownSync(JiraManifestSourceV2)
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
  const counts = countBy(
    [
      ...manifest.issues.flatMap((issue) => issue.description?.warnings ?? []),
      ...manifest.comments.flatMap((comment) => comment.body.warnings),
      ...(manifest.source.description?.warnings ?? [])
    ].map((warning) => warning.nodeType)
  )
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
      : resolution.kind === "invite"
        ? `_invited:_ ${escapeCell(resolution.email)}`
        : "_not linked_"
  ])
)}

Work by unlinked accounts keeps its original Jira display name on comments and is
preserved in the archive. No placeholder accounts were created. Invited people are
linked to their assigned tickets, reported tickets and comments when they accept
the invitation.

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

Custom fields, workflow metadata, changelogs, worklogs, watchers, voters and issue links
have no native ProjectProject model. Their original Jira JSON is retained beside this
report in \`${plan.archivePath}/archive.json\`. Epics, issues and subtasks keep their
hierarchy as epics and sub-tickets; parent links ProjectProject cannot hold are listed as
\`parent-dropped\` warnings below.

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

const decodeUnknownJiraPlannedArchiveSync =
  Schema.decodeUnknownSync(JiraPlannedArchive)

const ArchivedIssueLink = Schema.Struct({
  id: Schema.NonEmptyString,
  key: Schema.NonEmptyString,
  issueNumber: Schema.Int
})

const decodeUnknownArchivedDestinationKeySync = Schema.decodeUnknownSync(
  Schema.Struct({ destination: Schema.Struct({ key: Schema.NonEmptyString }) })
)

const decodeUnknownArchivedIssueLinkSync =
  Schema.decodeUnknownSync(ArchivedIssueLink)

const ArchivedAttachmentLink = Schema.Struct({
  id: Schema.NonEmptyString,
  issueId: Schema.NonEmptyString,
  filename: Schema.NonEmptyString,
  mimeType: Schema.NonEmptyString,
  byteSize: Schema.Int
})

const decodeUnknownArchivedAttachmentLinkSync = Schema.decodeUnknownSync(
  ArchivedAttachmentLink
)

const ArchivedSkippedOutcome = Schema.Struct({
  sourceAttachmentId: Schema.NonEmptyString,
  kind: Schema.Literal("skipped")
})

const recordsById = (records: ReadonlyArray<Schema.Json>) =>
  new Map(
    records.flatMap((item) =>
      Predicate.isObject(item) && Predicate.isString(item.id)
        ? [[item.id, item] as const]
        : []
    )
  )

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
  const issues = recordsById(archive.categories.issues ?? [])
  const attachments = recordsById(archive.categories.attachments ?? [])
  const destinationKey = decodeUnknownArchivedDestinationKeySync(
    archive.mappings
  ).destination.key
  return archive.attachmentOutcomes
    .filter(Schema.is(ArchivedSkippedOutcome))
    .map((outcome) => {
      const attachment = decodeUnknownArchivedAttachmentLinkSync(
        attachments.get(outcome.sourceAttachmentId)
      )
      const issue = decodeUnknownArchivedIssueLinkSync(
        issues.get(attachment.issueId)
      )
      const ticketId = `${destinationKey}-${issue.issueNumber}`
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
        targetTicketId: ticketId,
        sourceIssueUrl: jiraIssueUrl(site.origin, issue.key),
        targetTicketUrl: `/orgs/${encodeURIComponent(destination.orgSlug)}/projects/${encodeURIComponent(destination.projectSlug)}/tickets/${encodeURIComponent(ticketId)}`,
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

const decodeUnknownJiraPlannedReportSync =
  Schema.decodeUnknownSync(JiraPlannedReport)
export function buildJiraArchiveV2(
  prepared: JiraPreparedPublicationV1,
  outcomes: ReadonlyArray<JiraAttachmentOutcome>,
  findings: ReadonlyArray<JiraMigrationFinding> = []
) {
  const manifest = prepared.manifest
  const exclude = jiraRestrictionPolicy(prepared.configuration) === "exclude"
  const restrictions = new Map(
    manifest.restrictions.map((x) => [`${x.targetKind}:${x.targetId}`, x])
  )
  const restriction = (kind: string, id: string) =>
    exclude ? restrictions.get(`${kind}:${id}`) : undefined
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
        : { ...issue, description: archivedText(description) }
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
        : { ...comment, body: archivedText(body) }
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
        : { ...worklog, body: archivedText(body) }
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
      values: decodeUnknownJiraCustomFieldValuesSync(
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
  categories.findings = findings
  return decodeUnknownJiraPlannedArchiveSync({
    version: 1,
    manifestVersion: 2,
    migrationId: manifest.migrationId,
    source: {
      ...manifest.source,
      description: archivedText(prepared.source.projectDescription)
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

export type JiraReportCount = Readonly<{
  label: string
  found: number
  imported: number
}>

export type JiraReportSummary = Readonly<{
  destination: Readonly<{
    orgSlug: string
    slug: string
    key: string
    name: string
  }>
  counts: ReadonlyArray<JiraReportCount>
}>

type JiraFindingSection = "attention" | "left-out" | "changed" | "archive"

type JiraFindingKindInfo = Readonly<{
  section: JiraFindingSection
  title: string
  guidance: string
}>

const ATTACH_BY_HAND =
  "Download each file from its Jira issue and attach it to the ticket if you still need it."

const JIRA_FINDING_KINDS: Readonly<Record<string, JiraFindingKindInfo>> = {
  "attachment-skipped": {
    section: "attention",
    title: "Attachments not copied",
    guidance: `${ATTACH_BY_HAND} Files must be between 1 byte and ${ATTACHMENT_MAX_LABEL} and of a supported type.`
  },
  "attachment-failed": {
    section: "attention",
    title: "Attachments that failed to copy",
    guidance: ATTACH_BY_HAND
  },
  "embedded-file-unresolved": {
    section: "attention",
    title: "Embedded files that could not be matched",
    guidance:
      "The file name is shown in the text where the file was. Find the file on the Jira issue and add it by hand."
  },
  "source-reference-repaired": {
    section: "attention",
    title: "Jira values added from the issues that use them",
    guidance:
      "Jira's project lists did not include these statuses, types, priorities, components or versions, so they were taken from the issues themselves. Check how they were mapped in set up."
  },
  "source-duplicate-dropped": {
    section: "attention",
    title: "Records Jira returned twice",
    guidance:
      "Only the first copy of each was imported. Nothing is missing unless the copies differed in Jira."
  },
  "source-collection-unreadable": {
    section: "attention",
    title: "Jira data that could not be read",
    guidance:
      "Jira returned this data in a form that could not be read, so it was skipped. Check the Jira issue and add anything important by hand."
  },
  "source-visibility-limited": {
    section: "attention",
    title: "Data Jira returned only in part",
    guidance:
      "Check what the connected Jira account may see, then scan again if the missing data matters."
  },
  "assignee-unlinked": {
    section: "attention",
    title: "Assignees not linked to a member",
    guidance:
      "Assign these tickets by hand, or invite the person and assign them once they join."
  },
  "issue-excluded": {
    section: "left-out",
    title: "Restricted issues left out",
    guidance:
      "These stay in Jira only. Their sub-tickets were imported without a parent (see Parent links not kept)."
  },
  "comment-excluded": {
    section: "left-out",
    title: "Restricted comments left out",
    guidance: "These comments stay in Jira only."
  },
  "tag-skipped": {
    section: "left-out",
    title: "Labels and components skipped",
    guidance:
      "You chose not to import these as tags. They are still on the Jira issues and in archive.json."
  },
  "estimate-not-representable": {
    section: "left-out",
    title: "Estimates that could not be kept",
    guidance: "Set these estimates by hand if you need them."
  },
  "time-estimates-not-imported": {
    section: "left-out",
    title: "Time estimates not imported",
    guidance: "The original values are in archive.json."
  },
  "issue-key-changed": {
    section: "changed",
    title: "Ticket keys",
    guidance: ""
  },
  "parent-dropped": {
    section: "changed",
    title: "Parent links not kept",
    guidance: "Set a parent by hand where one should exist."
  },
  "restricted-content-included": {
    section: "changed",
    title: "Restricted content now visible to the project",
    guidance:
      "Everyone with access to the project can read these. Remove them if that is not intended."
  },
  "assignee-invited": {
    section: "changed",
    title: "Assignees waiting for an invitation",
    guidance: ""
  },
  "reporter-replaced": {
    section: "changed",
    title: "Reporters recorded as you",
    guidance: ""
  },
  "comment-author-unlinked": {
    section: "changed",
    title: "Comment authors kept as Jira names",
    guidance: ""
  },
  "tag-renamed": {
    section: "changed",
    title: "Labels and components renamed as tags",
    guidance: ""
  },
  "tags-merged": {
    section: "changed",
    title: "Labels and components merged into one tag",
    guidance: ""
  },
  "due-date-as-text": {
    section: "changed",
    title: "Due dates",
    guidance: ""
  },
  "resolution-as-text": {
    section: "changed",
    title: "Resolutions",
    guidance: ""
  },
  "text-degraded": {
    section: "changed",
    title: "Formatting that did not convert exactly",
    guidance:
      "The text is all there; only the formatting named here changed. The original Jira document is in archive.json."
  },
  "archive-only": {
    section: "archive",
    title: "Records with no place in ProjectProject",
    guidance: ""
  }
}

const SECTION_HEADINGS: ReadonlyArray<readonly [JiraFindingSection, string]> = [
  ["attention", "Needs your attention"],
  ["left-out", "Left out"],
  ["changed", "Changed on the way in"],
  ["archive", "Kept only in the archive"]
]

const REPORT_ROW_LIMIT = 200

const ticketLink = (summary: JiraReportSummary, ticketId: string | null) =>
  ticketId === null
    ? ""
    : `[${escapeCell(ticketId)}](/orgs/${encodeURIComponent(summary.destination.orgSlug)}/projects/${encodeURIComponent(summary.destination.slug)}/tickets/${encodeURIComponent(ticketId)})`

const kindInfo = (kind: string): JiraFindingKindInfo =>
  JIRA_FINDING_KINDS[kind] ?? {
    section: "attention",
    title: kind,
    guidance: ""
  }

function renderFindingSection(
  summary: JiraReportSummary,
  findings: ReadonlyArray<JiraMigrationFinding>,
  section: JiraFindingSection,
  heading: string
): ReadonlyArray<string> {
  const kinds = [
    ...new Set(
      findings
        .filter((finding) => kindInfo(finding.kind).section === section)
        .map((finding) => finding.kind)
    )
  ]
  if (kinds.length === 0) return []
  return [
    `## ${heading}`,
    "",
    ...kinds.flatMap((kind) => {
      const info = kindInfo(kind)
      const rows = findings.filter((finding) => finding.kind === kind)
      const withTickets = rows.some((row) => row.ticketId !== null)
      const shown = rows.slice(0, REPORT_ROW_LIMIT)
      return [
        `### ${info.title}`,
        "",
        ...(info.guidance === "" ? [] : [info.guidance, ""]),
        table(
          withTickets
            ? ["Subject", "What happened", "Ticket"]
            : ["Subject", "What happened"],
          shown.map((row) => [
            row.jiraUrl === null
              ? escapeCell(row.subject)
              : `[${escapeCell(row.subject).replace(/[[\]]/g, "\\$&")}](${row.jiraUrl})`,
            escapeCell(row.consequence),
            ...(withTickets ? [ticketLink(summary, row.ticketId)] : [])
          ])
        ),
        ...(rows.length > shown.length
          ? [
              "",
              `…and ${rows.length - shown.length} more. The full list is under \`findings\` in archive.json.`
            ]
          : []),
        ""
      ]
    })
  ]
}

export function buildJiraReportV2(
  archive: typeof JiraPlannedArchive.Type,
  summary: JiraReportSummary,
  findings: ReadonlyArray<JiraMigrationFinding>
) {
  const archivedCounts = Object.fromEntries(
    Object.entries(archive.categories).map(([category, values]) => [
      category,
      values.length
    ])
  )
  const nativeCounts = Object.fromEntries(
    summary.counts.map(({ label, imported }) => [label, imported])
  )
  const outcomes = decodeUnknownAttachmentOutcomesSync(
    archive.attachmentOutcomes
  )
  const coverage = decodeUnknownCoverageEntriesSync(
    archive.categories.coverage ?? []
  )
  const source = decodeUnknownJiraManifestSourceV2Sync(archive.source)
  const partialSuccess =
    outcomes.some((x) => x.kind !== "copied") ||
    archive.exclusions.some((x) => x.excludedReason === "excluded_by_user") ||
    coverage.some((x) => isCoverageLimited(x.visibility)) ||
    findings.some((finding) => {
      const section = kindInfo(finding.kind).section
      return section === "attention" || section === "left-out"
    })
  const { destination } = summary
  const markdown = [
    "# Jira import report",
    "",
    `**${escapeCell(source.projectKey)} · ${escapeCell(source.projectName)}** from ${source.siteUrl} was imported into **${escapeCell(destination.key)} · ${escapeCell(destination.name)}** (\`${destination.orgSlug}/${destination.slug}\`).`,
    "",
    `Scanned ${source.scannedAt} as ${escapeCell(source.visibleAccount.displayName)}. Only what that Jira account could see was scanned; anything it could not see is not in ProjectProject and is not listed below.`,
    "",
    `Restricted content was **${archive.restrictionPolicy === "exclude" ? "left out" : "included"}**.`,
    "",
    "## At a glance",
    "",
    table(
      ["", "In Jira", "In ProjectProject"],
      summary.counts.map(({ label, found, imported }) => [
        label,
        `${found}`,
        `${imported}`
      ])
    ),
    "",
    findings.length === 0
      ? "Nothing was left out or changed beyond the mappings you chose."
      : "Differences are explained below, most urgent first.",
    "",
    ...SECTION_HEADINGS.flatMap(([section, heading]) =>
      renderFindingSection(summary, findings, section, heading)
    ),
    "## What came across as is",
    "",
    "Summaries, descriptions and comments as markdown; statuses, issue types and priorities through your mappings; labels and components as tags; sprints with their dates; epics and sub-tickets where ProjectProject can hold them; assignees, reporters and comment authors you linked to members; created and updated times; and the attachments not listed above. Jira issue keys in text link to the imported tickets, and every ticket ends with a note linking back to its Jira issue.",
    "",
    "## Technical details",
    "",
    `Migration \`${archive.migrationId}\`. The original Jira data, including every record listed here, is in \`archive.json\` beside this report.`,
    "",
    "### Archived records",
    "",
    table(
      ["Category", "Count"],
      Object.entries(archivedCounts)
        .toSorted(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, count]) => [key, `${count}`])
    ),
    "",
    "### Coverage",
    "",
    table(
      ["Category", "Visibility", "Reason"],
      coverage.map((x) => [
        escapeCell(x.category),
        x.visibility,
        escapeCell(x.reason ?? "")
      ])
    ),
    "",
    "### Schema and converter versions",
    "",
    `\`${canonicalJiraJson(archive.schemaVersions)}\``,
    "",
    `\`${canonicalJiraJson(archive.converterVersions)}\``,
    ""
  ].join("\n")
  return decodeUnknownJiraPlannedReportSync({
    version: 1,
    partialSuccess,
    nativeCounts,
    archivedCounts,
    markdown
  })
}
