import {
  ATTACHMENT_MAX_BYTES,
  isAllowedAttachmentContentType,
  type JiraMigrationFinding
} from "@pp/shared"

import { countBy, groupBy } from "./collections"
import type { JiraParentDrop } from "./Hierarchy"
import { isCoverageLimited, type JiraMigrationManifestV2 } from "./Manifest"
import type { JiraIdentityResolution, JiraTagCandidate } from "./Mappings"

export type JiraTextWarnings = Readonly<{
  issueId: string
  commentId: string | null
  warnings: ReadonlyArray<Readonly<{ nodeType: string; reason: string }>>
}>

export type JiraEstimateDrop = Readonly<{
  issueId: string
  unit: "points" | "time"
  value: number
}>

export type JiraFindingsInput = Readonly<{
  manifest: JiraMigrationManifestV2
  restrictionPolicy: "exclude" | "include"
  destinationKey: string
  ticketIds: ReadonlyMap<string, string>
  identities: ReadonlyMap<string, JiraIdentityResolution>
  parentDrops: ReadonlyArray<JiraParentDrop>
  attachments: ReadonlyArray<
    Readonly<{
      sourceAttachmentId: string
      issueId: string
      filename: string
      decision: "copy" | "skip" | "exclude"
    }>
  >
  unresolvedMedia: ReadonlyArray<
    Readonly<{ source: string; mediaId: string; filename: string }>
  >
  tags: ReadonlyArray<JiraTagCandidate>
  tagDestinations: ReadonlyMap<string, string | null>
  skippedTags: ReadonlySet<string>
  textWarnings: ReadonlyArray<JiraTextWarnings>
  estimateDrops: ReadonlyArray<JiraEstimateDrop>
  ignoredTimeEstimates: number
}>

export const jiraIssueUrl = (siteUrl: string, key: string) =>
  `${siteUrl.replace(/\/$/, "")}/browse/${encodeURIComponent(key)}`

export const jiraFinding = (
  kind: string,
  subject: string,
  consequence: string,
  sourceId: string | null = null,
  ticketId: string | null = null,
  jiraUrl: string | null = null
): JiraMigrationFinding => ({
  kind,
  subject,
  sourceId,
  ticketId,
  jiraUrl,
  consequence
})

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`

const listKeys = (keys: ReadonlyArray<string>) =>
  keys.length <= 5
    ? keys.join(", ")
    : `${keys.slice(0, 5).join(", ")} and ${keys.length - 5} more`

const PARENT_DROP_CONSEQUENCES: Readonly<
  Record<JiraParentDrop["reason"], (parent: string) => string>
> = {
  "epic-cannot-have-parent": (parent) =>
    `It is an epic, and epics have no parent in ProjectProject, so its Jira parent ${parent} is not linked.`,
  "parent-not-scanned": (parent) =>
    `Its Jira parent ${parent} is in another project or not visible to the connected Jira account, so it was imported without a parent.`,
  "parent-excluded": (parent) =>
    `Its Jira parent ${parent} was left out as restricted content, so it was imported without a parent.`,
  "too-deeply-nested": (parent) =>
    `ProjectProject nests sub-tickets at most two levels below an epic, so it was imported without its parent ${parent}.`,
  "parent-cycle": (parent) =>
    `Its Jira parent ${parent} is also one of its descendants, so this parent link was not kept.`
}

const TEXT_WARNING_PHRASES: Readonly<Record<string, string>> = {
  "mark-dropped": "formatting dropped",
  "layout-flattened": "columns flattened",
  "unsupported-node": "kept as plain text",
  "invalid-date": "date dropped",
  "card-without-url": "link preview without a link",
  "reserved-marker-neutralized": "comment markers neutralised",
  "invalid-document": "could not be read"
}

const textWarningPhrase = (
  warning: Readonly<{ nodeType: string; reason: string }>
) =>
  `${warning.nodeType} ${TEXT_WARNING_PHRASES[warning.reason] ?? warning.reason}`

export const ATTACHMENT_MAX_LABEL = `${ATTACHMENT_MAX_BYTES / 1024 / 1024} MB`

const ATTACHMENT_FAILURE_PHRASES: Readonly<Record<string, string>> = {
  missing:
    "The file no longer exists in Jira, or you no longer have access to it.",
  forbidden: "Jira did not allow the file to be downloaded.",
  size_mismatch:
    "The file's size did not match what Jira reported, so the copy was discarded."
}

export const attachmentFailedFinding = (
  attachment: Readonly<{
    sourceAttachmentId: string
    filename: string
    issueKey: string
    ticketId: string | null
    siteUrl: string
  }>,
  reason: string
) =>
  jiraFinding(
    "attachment-failed",
    `${attachment.filename} (${attachment.issueKey})`,
    `${ATTACHMENT_FAILURE_PHRASES[reason] ?? "Copying it from Jira failed."} Download it from the Jira issue and add it to the ticket by hand if you need it.`,
    attachment.sourceAttachmentId,
    attachment.ticketId,
    jiraIssueUrl(attachment.siteUrl, attachment.issueKey)
  )

const attachmentSkipReason = (
  attachment: JiraMigrationManifestV2["attachments"][number] | undefined
) =>
  attachment === undefined
    ? "it was skipped"
    : !attachment.downloadAllowed || attachment.downloadUrl === null
      ? "Jira did not allow it to be downloaded"
      : attachment.byteSize <= 0
        ? "it is empty"
        : attachment.byteSize > ATTACHMENT_MAX_BYTES
          ? `it is larger than ${ATTACHMENT_MAX_LABEL}`
          : !isAllowedAttachmentContentType(attachment.mimeType)
            ? `its type (${attachment.mimeType}) cannot be stored in ProjectProject`
            : "you chose to skip it"

export function buildJiraFindings(
  input: JiraFindingsInput
): ReadonlyArray<JiraMigrationFinding> {
  const { manifest } = input
  const issues = new Map(manifest.issues.map((issue) => [issue.id, issue]))
  const keyOf = (issueId: string) => issues.get(issueId)?.key ?? issueId
  const urlOf = (issueId: string) => {
    const key = issues.get(issueId)?.key
    return key === undefined ? null : jiraIssueUrl(manifest.source.siteUrl, key)
  }
  const ticketOf = (issueId: string) => input.ticketIds.get(issueId) ?? null
  const imported = (issueId: string) => input.ticketIds.has(issueId)
  const names = new Map(
    manifest.identities.map((identity) => [
      identity.accountId,
      identity.displayName
    ])
  )
  const attachmentsById = new Map(
    manifest.attachments.map((attachment) => [attachment.id, attachment])
  )
  const comments = new Map(
    manifest.comments.map((comment) => [comment.id, comment])
  )
  const findings: Array<JiraMigrationFinding> = []

  if (input.destinationKey !== manifest.source.projectKey)
    findings.push(
      jiraFinding(
        "issue-key-changed",
        `${manifest.source.projectKey} → ${input.destinationKey}`,
        `Tickets were renumbered from ${manifest.source.projectKey}-n to ${input.destinationKey}-n with the same numbers. Each ticket links back to its Jira issue at the end of its description, and Jira keys written in text were turned into links to the new tickets.`
      )
    )

  for (const coverage of manifest.coverage)
    if (isCoverageLimited(coverage.visibility))
      findings.push(
        jiraFinding(
          "source-visibility-limited",
          coverage.category,
          `Jira returned only part of this data (${coverage.reason ?? "unknown reason"}); what was missing is not in ProjectProject.`
        )
      )

  for (const restriction of manifest.restrictions) {
    if (restriction.targetKind === "worklog") continue
    const issueId =
      restriction.targetKind === "issue"
        ? restriction.targetId
        : comments.get(restriction.targetId)?.issueId
    if (issueId === undefined) continue
    const subject =
      restriction.targetKind === "issue"
        ? keyOf(issueId)
        : `${keyOf(issueId)} comment`
    if (input.restrictionPolicy === "exclude") {
      if (restriction.targetKind === "issue")
        findings.push(
          jiraFinding(
            "issue-excluded",
            subject,
            `Restricted in Jira (${restriction.source}); left out because restricted content is excluded, together with its comments and attachments.`,
            issueId,
            null,
            urlOf(issueId)
          )
        )
      else if (imported(issueId))
        findings.push(
          jiraFinding(
            "comment-excluded",
            subject,
            "Visible only to a Jira role or group; left out because restricted content is excluded.",
            restriction.targetId,
            ticketOf(issueId),
            urlOf(issueId)
          )
        )
    } else if (imported(issueId))
      findings.push(
        jiraFinding(
          "restricted-content-included",
          subject,
          `Restricted in Jira (${restriction.source}); imported because you chose to include restricted content, so everyone in the project can see it.`,
          restriction.targetKind === "issue" ? issueId : restriction.targetId,
          ticketOf(issueId),
          urlOf(issueId)
        )
      )
  }

  for (const drop of input.parentDrops)
    findings.push(
      jiraFinding(
        "parent-dropped",
        keyOf(drop.issueId),
        PARENT_DROP_CONSEQUENCES[drop.reason](
          drop.parentIssueKey ?? keyOf(drop.parentIssueId)
        ),
        drop.issueId,
        ticketOf(drop.issueId),
        urlOf(drop.issueId)
      )
    )

  for (const attachment of input.attachments) {
    if (attachment.decision !== "skip") continue
    findings.push(
      jiraFinding(
        "attachment-skipped",
        `${attachment.filename} (${keyOf(attachment.issueId)})`,
        `Not copied because ${attachmentSkipReason(attachmentsById.get(attachment.sourceAttachmentId))}. Download it from the Jira issue and add it to the ticket by hand if you need it.`,
        attachment.sourceAttachmentId,
        ticketOf(attachment.issueId),
        urlOf(attachment.issueId)
      )
    )
  }

  const issuesByKey = new Map(
    manifest.issues.map((issue) => [issue.key, issue.id])
  )
  const mediaIdsBySource = groupBy(
    input.unresolvedMedia,
    (media) => media.source,
    (media) => media.mediaId
  )
  for (const [source, mediaIds] of mediaIdsBySource) {
    const issueId = issuesByKey.get(source)
    findings.push(
      jiraFinding(
        "embedded-file-unresolved",
        mediaIds.length === 1
          ? `${source}: embedded file`
          : `${source}: ${plural(mediaIds.length, "embedded file")}`,
        `${mediaIds.length === 1 ? "An embedded file" : `${mediaIds.length} embedded files`} could not be matched to a copied attachment, so ${mediaIds.length === 1 ? "its name is" : "their names are"} shown in the text instead. Open the Jira issue to find ${mediaIds.length === 1 ? "the file" : "the files"} and add ${mediaIds.length === 1 ? "it" : "them"} by hand if needed (Jira media ${mediaIds.join(", ")}).`,
        issueId ?? null,
        issueId === undefined ? null : ticketOf(issueId),
        issueId === undefined ? null : urlOf(issueId)
      )
    )
  }

  const byAccount = (
    accountOf: (
      issue: JiraMigrationManifestV2["issues"][number]
    ) => string | null
  ) =>
    groupBy(
      manifest.issues.filter(
        (issue) => accountOf(issue) !== null && imported(issue.id)
      ),
      (issue) => accountOf(issue) ?? "",
      (issue) => issue.key
    )
  for (const [accountId, keys] of byAccount(
    (issue) => issue.assigneeAccountId
  )) {
    const resolution = input.identities.get(accountId)
    if (resolution === undefined || resolution.kind === "link") continue
    const name = names.get(accountId) ?? accountId
    findings.push(
      resolution.kind === "invite"
        ? jiraFinding(
            "assignee-invited",
            name,
            `Assignee of ${plural(keys.length, "issue")} (${listKeys(keys)}). Those tickets are unassigned until ${resolution.email} accepts the invitation; then they are assigned automatically.`,
            accountId
          )
        : jiraFinding(
            "assignee-unlinked",
            name,
            `Assignee of ${plural(keys.length, "issue")} (${listKeys(keys)}) but not linked to a ProjectProject member, so those tickets are unassigned. The name is kept in each ticket's import note.`,
            accountId
          )
    )
  }
  for (const [accountId, keys] of byAccount(
    (issue) => issue.reporterAccountId
  )) {
    const resolution = input.identities.get(accountId)
    if (resolution === undefined || resolution.kind === "link") continue
    findings.push(
      jiraFinding(
        "reporter-replaced",
        names.get(accountId) ?? accountId,
        resolution.kind === "invite"
          ? `Reporter of ${plural(keys.length, "issue")} (${listKeys(keys)}). Those tickets show you as creator until ${resolution.email} accepts the invitation.`
          : `Reporter of ${plural(keys.length, "issue")} (${listKeys(keys)}) but not linked, so those tickets show you as creator. The name is kept in each ticket's import note.`,
        accountId
      )
    )
  }
  const commentsByAuthor = countBy(
    manifest.comments
      .filter((comment) => imported(comment.issueId))
      .map((comment) => comment.authorAccountId)
  )
  for (const [accountId, count] of commentsByAuthor) {
    const resolution = input.identities.get(accountId)
    if (resolution === undefined || resolution.kind === "link") continue
    findings.push(
      jiraFinding(
        "comment-author-unlinked",
        names.get(accountId) ?? accountId,
        resolution.kind === "invite"
          ? `Wrote ${plural(count, "comment")}; they show the Jira name until ${resolution.email} accepts the invitation and then become theirs.`
          : `Wrote ${plural(count, "comment")}; they keep the Jira name because the account is not linked to a member.`,
        accountId
      )
    )
  }

  const tagUses = countBy(
    manifest.issues
      .filter((issue) => imported(issue.id))
      .flatMap((issue) => [
        ...new Set([
          ...issue.labelIds.map((label) => `label:${label}`),
          ...issue.componentIds.map((id) => `component:${id}`)
        ])
      ])
  )
  const taggedCandidates: Array<
    Readonly<{ tag: string; candidate: JiraTagCandidate }>
  > = []
  for (const candidate of input.tags) {
    const uses = tagUses.get(candidate.sourceId) ?? 0
    if (uses === 0) continue
    if (
      input.skippedTags.has(`${candidate.sourceKind}:${candidate.sourceValue}`)
    ) {
      findings.push(
        jiraFinding(
          "tag-skipped",
          `${candidate.sourceKind} "${candidate.sourceValue}"`,
          `Not imported as a tag because you chose to skip it; ${plural(uses, "ticket")} that carried it in Jira arrive without it.`,
          candidate.sourceId
        )
      )
      continue
    }
    const tag = input.tagDestinations.get(candidate.sourceId) ?? null
    if (tag === null) continue
    taggedCandidates.push({ tag, candidate })
    if (tag !== candidate.sourceValue)
      findings.push(
        jiraFinding(
          "tag-renamed",
          `${candidate.sourceKind} "${candidate.sourceValue}"`,
          `Became tag \`${tag}\`.`,
          candidate.sourceId
        )
      )
  }
  for (const [tag, sources] of groupBy(
    taggedCandidates,
    ({ tag }) => tag,
    ({ candidate }) => candidate
  ))
    if (sources.length > 1)
      findings.push(
        jiraFinding(
          "tags-merged",
          tag,
          `${sources.map((source) => `${source.sourceKind} "${source.sourceValue}"`).join(" and ")} all became the one tag \`${tag}\`.`
        )
      )

  for (const drop of input.estimateDrops)
    findings.push(
      jiraFinding(
        "estimate-not-representable",
        keyOf(drop.issueId),
        drop.unit === "points"
          ? `Its ${drop.value} story points were not kept: ProjectProject points are whole numbers from 1 to 999. The value is in the archive.`
          : `Its original estimate of ${drop.value} seconds was not kept: ProjectProject time estimates are whole minutes up to 999 hours. The value is in the archive.`,
        drop.issueId,
        ticketOf(drop.issueId),
        urlOf(drop.issueId)
      )
    )
  if (input.ignoredTimeEstimates > 0)
    findings.push(
      jiraFinding(
        "time-estimates-not-imported",
        plural(input.ignoredTimeEstimates, "issue"),
        "These issues also had a Jira time estimate. A ProjectProject project estimates in one unit and this one uses story points, so the time estimates were not imported. They are in the archive."
      )
    )

  const importedIssues = manifest.issues.filter((issue) => imported(issue.id))
  const dueDates = importedIssues.filter((issue) => issue.dueDate).length
  if (dueDates > 0)
    findings.push(
      jiraFinding(
        "due-date-as-text",
        plural(dueDates, "ticket"),
        "ProjectProject has no due date field, so each Jira due date is written in the ticket's import note instead."
      )
    )
  const resolutions = importedIssues.filter((issue) => issue.resolution).length
  if (resolutions > 0)
    findings.push(
      jiraFinding(
        "resolution-as-text",
        plural(resolutions, "ticket"),
        "ProjectProject has no resolution field; each ticket's status comes from your status mapping, and the Jira resolution and resolution date are written in its import note."
      )
    )

  for (const text of input.textWarnings) {
    if (!imported(text.issueId) || text.warnings.length === 0) continue
    findings.push(
      jiraFinding(
        "text-degraded",
        text.commentId === null
          ? `${keyOf(text.issueId)} description`
          : `${keyOf(text.issueId)} comment`,
        `Some Jira formatting has no markdown equivalent: ${[...new Set(text.warnings.map(textWarningPhrase))].join("; ")}.`,
        text.commentId ?? text.issueId,
        ticketOf(text.issueId),
        urlOf(text.issueId)
      )
    )
  }

  const archiveOnly: ReadonlyArray<readonly [string, number]> = [
    ["Issue links", manifest.links.length],
    ["Worklogs", manifest.worklogs.length],
    ["Change history entries", manifest.changelogs.length],
    ["Watchers", manifest.watchers.length],
    ["Votes", manifest.votes.length],
    ["Fix versions and releases", manifest.versionsReleases.length],
    ["Custom fields", manifest.customFields.length],
    ["Board ranks", manifest.ranks.length]
  ]
  for (const [category, count] of archiveOnly)
    if (count > 0)
      findings.push(
        jiraFinding(
          "archive-only",
          `${category} (${count})`,
          "ProjectProject has no place for this, so it is kept only in archive.json beside this report."
        )
      )
  return findings
}
