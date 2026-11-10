import type { JiraMigrationFinding } from "@pp/shared"

import { m } from "@/paraglide/messages"

type FindingSection = "attention" | "left-out" | "changed" | "archive"

type FindingKind = Readonly<{ section: FindingSection; title: () => string }>

const kinds = new Map<string, FindingKind>(
  Object.entries({
    "attachment-skipped": {
      section: "attention",
      title: m.jira_import_finding_attachment_skipped
    },
    "attachment-failed": {
      section: "attention",
      title: m.jira_import_finding_attachment_failed
    },
    "embedded-file-unresolved": {
      section: "attention",
      title: m.jira_import_finding_embedded_file_unresolved
    },
    "source-visibility-limited": {
      section: "attention",
      title: m.jira_import_finding_source_visibility_limited
    },
    "source-collection-unreadable": {
      section: "attention",
      title: m.jira_import_finding_source_collection_unreadable
    },
    "source-reference-repaired": {
      section: "changed",
      title: m.jira_import_finding_source_reference_repaired
    },
    "source-duplicate-dropped": {
      section: "changed",
      title: m.jira_import_finding_source_duplicate_dropped
    },
    "assignee-unlinked": {
      section: "attention",
      title: m.jira_import_finding_assignee_unlinked
    },
    "issue-excluded": {
      section: "left-out",
      title: m.jira_import_finding_issue_excluded
    },
    "comment-excluded": {
      section: "left-out",
      title: m.jira_import_finding_comment_excluded
    },
    "estimate-not-representable": {
      section: "left-out",
      title: m.jira_import_finding_estimate_not_representable
    },
    "time-estimates-not-imported": {
      section: "left-out",
      title: m.jira_import_finding_time_estimates_not_imported
    },
    "issue-key-changed": {
      section: "changed",
      title: m.jira_import_finding_issue_key_changed
    },
    "parent-dropped": {
      section: "changed",
      title: m.jira_import_finding_parent_dropped
    },
    "restricted-content-included": {
      section: "changed",
      title: m.jira_import_finding_restricted_content_included
    },
    "assignee-invited": {
      section: "changed",
      title: m.jira_import_finding_assignee_invited
    },
    "reporter-replaced": {
      section: "changed",
      title: m.jira_import_finding_reporter_replaced
    },
    "comment-author-unlinked": {
      section: "changed",
      title: m.jira_import_finding_comment_author_unlinked
    },
    "tag-renamed": {
      section: "changed",
      title: m.jira_import_finding_tag_renamed
    },
    "tags-merged": {
      section: "changed",
      title: m.jira_import_finding_tags_merged
    },
    "due-date-as-text": {
      section: "changed",
      title: m.jira_import_finding_due_date_as_text
    },
    "resolution-as-text": {
      section: "changed",
      title: m.jira_import_finding_resolution_as_text
    },
    "text-degraded": {
      section: "changed",
      title: m.jira_import_finding_text_degraded
    },
    "archive-only": {
      section: "archive",
      title: m.jira_import_finding_archive_only
    }
  })
)

const sectionOrder: ReadonlyArray<FindingSection> = [
  "attention",
  "left-out",
  "changed",
  "archive"
]

export type JiraFindingGroup = Readonly<{
  kind: string
  title: string | null
  findings: ReadonlyArray<JiraMigrationFinding>
}>

const rank = (kind: string): number => {
  const known = kinds.get(kind)
  return known === undefined
    ? sectionOrder.length
    : sectionOrder.indexOf(known.section)
}

export function groupJiraFindings(
  findings: ReadonlyArray<JiraMigrationFinding>
): ReadonlyArray<JiraFindingGroup> {
  const byKind = new Map<string, Array<JiraMigrationFinding>>()
  for (const finding of findings) {
    const group = byKind.get(finding.kind)
    if (group === undefined) byKind.set(finding.kind, [finding])
    else group.push(finding)
  }
  return [...byKind.entries()]
    .map(([kind, items]) => ({
      kind,
      title: kinds.get(kind)?.title() ?? null,
      findings: items
    }))
    .toSorted((a, b) => rank(a.kind) - rank(b.kind))
}
