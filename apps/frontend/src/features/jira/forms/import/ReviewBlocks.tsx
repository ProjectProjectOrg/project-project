import type {
  JiraMigrationDestinationConflict,
  JiraMigrationRequirements,
  JiraMigrationScanSummary
} from "@pp/shared"

import { SegmentedTabs } from "@/components/ui/segmented-tabs"
import { FactBlock, FactList, FactRow } from "@/features/jira/components/Facts"
import { conflictMessages } from "@/features/jira/lib/destination"
import {
  hasRestrictedContent,
  type JiraImportDraft
} from "@/features/jira/lib/draft"
import { excludedIssues } from "@/features/jira/lib/review"
import type { JiraSetupCounts } from "@/features/jira/lib/setup"
import { jiraVisibility } from "@/features/jira/lib/warnings"
import { m } from "@/paraglide/messages"

import type { JiraImportForm } from "./opts"
import { FailedAttachments, SkippedAttachments } from "./ReviewAttachments"

type Requirements = JiraMigrationRequirements
export function CreatedBlock({
  requirements,
  summary,
  draft,
  counts,
  conflicts
}: Readonly<{
  requirements: Requirements
  summary: JiraMigrationScanSummary
  draft: JiraImportDraft
  counts: JiraSetupCounts
  conflicts: ReadonlyArray<JiraMigrationDestinationConflict>
}>) {
  const destination = draft.setup.destination
  const excluded = excludedIssues(requirements, draft).length
  const created = draft.setup.statuses.flatMap((status, index) =>
    status.createStatus === true
      ? [
          requirements.statuses[index]?.createOption?.label ??
            status.jiraStatusId
        ]
      : []
  )
  return (
    <FactBlock title={m.jira_import_review_created_title()}>
      <FactList>
        <FactRow label={m.jira_import_destination_name()}>
          {destination.name}
        </FactRow>
        <FactRow label={m.jira_import_destination_key()}>
          <span className="font-mono">{destination.key}</span>
        </FactRow>
        <FactRow label={m.jira_import_destination_slug()}>
          <span className="font-mono">{destination.slug}</span>
        </FactRow>
        <FactRow label={m.jira_import_fact_tickets()}>
          {excluded === 0
            ? m.jira_import_count({ count: summary.counts.issues })
            : m.jira_import_review_tickets_excluded({
                found: summary.counts.issues,
                imported: Math.max(0, summary.counts.issues - excluded)
              })}
        </FactRow>
        {summary.counts.epics === undefined ||
        summary.counts.epics === 0 ? null : (
          <FactRow
            label={m.jira_import_fact_epics_found()}
            note={m.jira_import_fact_found_note()}
          >
            {m.jira_import_count({ count: summary.counts.epics })}
          </FactRow>
        )}
        {summary.counts.subTickets === undefined ? null : (
          <FactRow
            label={m.jira_import_fact_sub_tickets_found()}
            note={m.jira_import_fact_found_note()}
          >
            {m.jira_import_count({ count: summary.counts.subTickets })}
          </FactRow>
        )}
        <FactRow label={m.jira_import_fact_comments()}>
          {m.jira_import_count({ count: summary.counts.comments })}
        </FactRow>
        <FactRow label={m.jira_import_fact_attachments()}>
          {m.jira_import_count({
            count: Math.max(
              0,
              summary.counts.attachments -
                draft.review.skippedAttachmentIds.length
            )
          })}
        </FactRow>
        {summary.counts.sprints === undefined ? null : (
          <FactRow label={m.jira_import_fact_sprints()}>
            {m.jira_import_count({ count: summary.counts.sprints })}
          </FactRow>
        )}
        <FactRow label={m.jira_import_fact_tags()}>
          {m.jira_import_count({
            count: Math.max(0, summary.counts.tags - counts.tags.skipped)
          })}
        </FactRow>
        <FactRow
          label={m.jira_import_fact_statuses_created()}
          note={created.length > 0 ? created.join(", ") : undefined}
        >
          {m.jira_import_count({ count: created.length })}
        </FactRow>
        <FactRow
          label={m.jira_import_fact_people()}
          note={
            counts.people.unlinked > 0
              ? m.jira_import_people_unlinked_consequence()
              : undefined
          }
        >
          {m.jira_import_people_summary({
            linked: counts.people.linked,
            invited: counts.people.invited,
            unlinked: counts.people.unlinked
          })}
        </FactRow>
      </FactList>
      {conflicts.length > 0 ? (
        <ul role="alert" className="flex flex-col gap-1 pt-2">
          {conflictMessages(conflicts).map((message) => (
            <li key={message} className="text-[13px] text-destructive">
              {message}
            </li>
          ))}
        </ul>
      ) : null}
    </FactBlock>
  )
}

export function LeftBehindBlock({
  form,
  requirements,
  summary,
  draft,
  failedAttachmentIds,
  commit
}: Readonly<{
  form: JiraImportForm
  requirements: Requirements
  summary: JiraMigrationScanSummary
  draft: JiraImportDraft
  failedAttachmentIds: ReadonlyArray<string>
  commit: () => void
}>) {
  const forced = requirements.attachments.filter(
    (attachment) => attachment.forcedSkipReason !== null
  )
  const failed = requirements.attachments.filter((attachment) =>
    failedAttachmentIds.includes(attachment.jiraAttachmentId)
  )
  const restricted = hasRestrictedContent(requirements)
  const skippedTags = draft.setup.tags.flatMap((tag) =>
    tag.skipped === true ? [tag.source.value] : []
  )
  const visibility = jiraVisibility(summary.visibilityWarnings)
  const nothing =
    !restricted &&
    skippedTags.length === 0 &&
    forced.length === 0 &&
    failed.length === 0 &&
    visibility.kind === "complete"
  return (
    <FactBlock
      title={m.jira_import_review_left_title()}
      description={
        nothing
          ? m.jira_import_review_left_none()
          : visibility.kind === "account"
            ? m.jira_import_scan_visibility_account()
            : undefined
      }
    >
      {restricted ? (
        <RestrictedChoice
          form={form}
          requirements={requirements}
          draft={draft}
          commit={commit}
        />
      ) : null}
      {skippedTags.length > 0 ? (
        <FactList>
          <FactRow label={m.jira_import_review_tags_skipped()}>
            {skippedTags.length > 12
              ? m.jira_import_review_more({
                  list: skippedTags.slice(0, 12).join(", "),
                  count: skippedTags.length - 12
                })
              : skippedTags.join(", ")}
          </FactRow>
        </FactList>
      ) : null}
      {forced.length > 0 ? <SkippedAttachments forced={forced} /> : null}
      {failed.length > 0 ? (
        <FailedAttachments form={form} failed={failed} commit={commit} />
      ) : null}
      {visibility.kind === "limited" ? (
        <FactList>
          {visibility.rows.map((row) => (
            <FactRow key={`${row.label}:${row.detail}`} label={row.label}>
              {row.detail}
            </FactRow>
          ))}
        </FactList>
      ) : null}
    </FactBlock>
  )
}

function RestrictedChoice({
  form,
  requirements,
  draft,
  commit
}: Readonly<{
  form: JiraImportForm
  requirements: Requirements
  draft: JiraImportDraft
  commit: () => void
}>) {
  const restricted = requirements.restrictedContent
  const excluded = excludedIssues(requirements, draft)
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-[13px] text-foreground">
        {m.jira_import_restricted_found({
          issues: restricted.issueCount,
          comments: restricted.commentCount,
          worklogs: restricted.worklogCount
        })}
      </p>
      <p className="max-w-[65ch] text-xs text-muted-foreground">
        {m.jira_import_restricted_description()}
      </p>
      <form.Field name="review.restrictedContent">
        {(field) => (
          <div className="flex">
            <SegmentedTabs
              aria-label={m.jira_import_restricted_choice()}
              value={field.value.policy}
              onValueChange={(policy) => {
                field.handleChange(
                  policy === "exclude"
                    ? { policy: "exclude" }
                    : { policy: "include", disclosureAccepted: true }
                )
                commit()
              }}
              items={[
                { key: "exclude", label: m.jira_import_restricted_exclude() },
                { key: "include", label: m.jira_import_restricted_include() }
              ]}
            />
          </div>
        )}
      </form.Field>
      {excluded.length > 0 ? (
        <FactList>
          {excluded.map((issue) => (
            <FactRow
              key={issue.jiraIssueId}
              label={issue.issueKey}
              note={
                issue.childIssueKeys.length > 0
                  ? m.jira_import_restricted_orphans({
                      count: issue.childIssueKeys.length,
                      keys: issue.childIssueKeys.join(", ")
                    })
                  : undefined
              }
            >
              {issue.issueSummary === ""
                ? m.jira_import_restricted_no_summary()
                : issue.issueSummary}
            </FactRow>
          ))}
        </FactList>
      ) : null}
    </div>
  )
}
