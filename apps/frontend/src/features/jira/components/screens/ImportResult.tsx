import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type {
  JiraMigrationDetail,
  JiraMigrationResult,
  JiraSkippedAttachment
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { useId, useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { AutoHeight } from "@/components/ui/auto-height"
import { Button } from "@/components/ui/button"
import { Markdown } from "@/features/editor/components/Markdown"
import {
  jiraMigrationReport,
  jiraReportRequest,
  jiraSkippedAttachments,
  jiraSkippedAttachmentsRequest
} from "@/features/jira/atoms/jiraMigration"
import { textLinkClass } from "@/lib/textLink"
import { m } from "@/paraglide/messages"

import { FactBlock, FactList, FactRow } from "../Facts"
import { JiraFindings } from "../Findings"
import { ReadFailure } from "../ReadFailure"
import { StepFrame } from "../StepFrame"

const replacementNotes: Readonly<
  Record<JiraSkippedAttachment["replacement"], () => string>
> = {
  available: m.jira_import_result_skipped_replace,
  too_large: m.jira_import_attachment_too_large,
  unsupported_type: m.jira_import_attachment_unsupported
}

export function ImportResult({
  orgSlug,
  detail
}: Readonly<{ orgSlug: string; detail: JiraMigrationDetail }>) {
  const configuration = detail.configuration
  const slug = detail.destinationProjectSlug

  return (
    <StepFrame
      title={m.jira_import_result_title({
        project: configuration?.destination.name ?? detail.sourceProjectName
      })}
      description={m.jira_import_result_description()}
      end={
        slug === null ? undefined : (
          <Button
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug"
                params={{ orgSlug, slug }}
              />
            }
          >
            {m.jira_import_action_open_project()}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-10">
        {detail.result === undefined ? (
          <LegacyCounts detail={detail} />
        ) : (
          <ResultCounts result={detail.result} />
        )}

        {detail.result === undefined ? (
          <LegacyLeftBehind orgSlug={orgSlug} detail={detail} />
        ) : (
          <FactBlock
            title={m.jira_import_result_findings_title()}
            description={
              detail.result.findings.length === 0
                ? m.jira_import_result_left_none()
                : m.jira_import_result_findings_description()
            }
          >
            {detail.result.findings.length === 0 ? null : (
              <JiraFindings
                findings={detail.result.findings}
                project={slug === null ? null : { orgSlug, slug }}
              />
            )}
          </FactBlock>
        )}

        <FactBlock
          title={m.jira_import_result_report_title()}
          description={m.jira_import_result_report_description()}
        >
          <FullReport orgSlug={orgSlug} migrationId={detail.id} />
        </FactBlock>
      </div>
    </StepFrame>
  )
}

function SkippedAttachments({
  orgSlug,
  slug,
  migrationId
}: Readonly<{ orgSlug: string; slug: string; migrationId: string }>) {
  const atom = jiraSkippedAttachments(
    jiraSkippedAttachmentsRequest(orgSlug, migrationId)
  )
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  return (
    <AsyncView
      result={result}
      onInitial={() => (
        <p className="animate-pulse text-body text-muted-foreground">
          {m.jira_import_result_skipped_loading()}
        </p>
      )}
      onFailure={(failure) => (
        <ReadFailure failure={failure} onRetry={refresh} />
      )}
      onSuccess={({ value }) => (
        <FactList>
          {value.map((attachment) => (
            <FactRow
              key={attachment.sourceAttachmentId}
              label={attachment.sourceIssueKey}
              note={replacementNotes[attachment.replacement]()}
            >
              <span className="flex flex-col gap-1">
                <span className="font-mono break-all">
                  {attachment.filename}
                </span>
                <span className="flex flex-wrap gap-x-4 text-caption">
                  <a
                    href={attachment.sourceIssueUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={textLinkClass}
                  >
                    {m.jira_import_result_open_in_jira({
                      issue: attachment.sourceIssueKey
                    })}
                  </a>
                  <Link
                    to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                    params={{ orgSlug, slug, id: attachment.targetTicketId }}
                    className={textLinkClass}
                  >
                    {m.jira_import_result_open_ticket({
                      ticket: attachment.targetTicketId
                    })}
                  </Link>
                </span>
              </span>
            </FactRow>
          ))}
        </FactList>
      )}
    />
  )
}

function ResultCounts({ result }: Readonly<{ result: JiraMigrationResult }>) {
  return (
    <FactBlock title={m.jira_import_result_imported_title()}>
      <FactList>
        <FactRow label={m.jira_import_fact_tickets()}>
          {m.jira_import_count({ count: result.tickets })}
        </FactRow>
        <FactRow label={m.jira_import_fact_comments()}>
          {m.jira_import_count({ count: result.comments })}
        </FactRow>
        <FactRow
          label={m.jira_import_fact_attachments()}
          note={
            result.attachmentsSkipped + result.attachmentsFailed > 0
              ? m.jira_import_result_attachments_note({
                  skipped: result.attachmentsSkipped,
                  failed: result.attachmentsFailed
                })
              : undefined
          }
        >
          {m.jira_import_count({ count: result.attachmentsCopied })}
        </FactRow>
        <FactRow label={m.jira_import_fact_people()}>
          {m.jira_import_people_summary({
            linked: result.peopleLinked,
            invited: result.peopleInvited,
            unlinked: result.peopleUnlinked
          })}
        </FactRow>
        <FactRow label={m.jira_import_fact_statuses_created()}>
          {m.jira_import_count({ count: result.statusesCreated })}
        </FactRow>
      </FactList>
    </FactBlock>
  )
}

function LegacyCounts({ detail }: Readonly<{ detail: JiraMigrationDetail }>) {
  const summary = detail.scanSummary
  if (summary === null) return null
  const configuration = detail.configuration
  const skipped = configuration?.skippedAttachmentIds.length ?? 0
  const identities = configuration?.identities ?? []
  return (
    <FactBlock title={m.jira_import_result_imported_title()}>
      <FactList>
        <FactRow label={m.jira_import_fact_tickets()}>
          {m.jira_import_count({ count: summary.counts.issues })}
        </FactRow>
        <FactRow label={m.jira_import_fact_comments()}>
          {m.jira_import_count({ count: summary.counts.comments })}
        </FactRow>
        <FactRow label={m.jira_import_fact_attachments()}>
          {m.jira_import_count({
            count: Math.max(0, summary.counts.attachments - skipped)
          })}
        </FactRow>
        <FactRow label={m.jira_import_fact_people()}>
          {m.jira_import_result_people({
            linked: identities.filter(
              (identity) => identity.projectProjectUserId !== null
            ).length,
            invited: identities.filter(
              (identity) => identity.inviteEmail !== undefined
            ).length
          })}
        </FactRow>
      </FactList>
    </FactBlock>
  )
}

function LegacyLeftBehind({
  orgSlug,
  detail
}: Readonly<{ orgSlug: string; detail: JiraMigrationDetail }>) {
  const skipped = detail.configuration?.skippedAttachmentIds.length ?? 0
  const slug = detail.destinationProjectSlug
  return (
    <FactBlock
      title={m.jira_import_result_left_title()}
      description={skipped === 0 ? m.jira_import_result_left_none() : undefined}
    >
      {skipped > 0 && slug !== null ? (
        <SkippedAttachments
          orgSlug={orgSlug}
          slug={slug}
          migrationId={detail.id}
        />
      ) : null}
    </FactBlock>
  )
}

function FullReport({
  orgSlug,
  migrationId
}: Readonly<{ orgSlug: string; migrationId: string }>) {
  const [open, setOpen] = useState(false)
  const regionId = useId()
  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button
          variant="tertiary"
          size="sm"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? m.jira_import_report_close() : m.jira_import_report_open()}
        </Button>
      </div>
      <AutoHeight>
        {open ? (
          <div id={regionId} className="border-t border-border pt-4">
            <ReportBody orgSlug={orgSlug} migrationId={migrationId} />
          </div>
        ) : null}
      </AutoHeight>
    </div>
  )
}

function ReportBody({
  orgSlug,
  migrationId
}: Readonly<{ orgSlug: string; migrationId: string }>) {
  const atom = jiraMigrationReport(jiraReportRequest(orgSlug, migrationId))
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  return (
    <AsyncView
      result={result}
      onInitial={() => (
        <p className="animate-pulse text-body text-muted-foreground">
          {m.jira_import_report_loading()}
        </p>
      )}
      onFailure={(failure) => (
        <ReadFailure failure={failure} onRetry={refresh} />
      )}
      onSuccess={({ value }) => <Markdown>{value.markdown}</Markdown>}
    />
  )
}
