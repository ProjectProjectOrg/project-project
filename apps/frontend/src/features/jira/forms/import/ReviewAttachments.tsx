import type { JiraMigrationRequirements } from "@pp/shared"
import { useState } from "react"

import { AutoHeight } from "@/components/ui/auto-height"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FactList, FactRow } from "@/features/jira/components/Facts"
import {
  attachmentSkip,
  attachmentSkipCounts,
  type JiraAttachmentSkip
} from "@/features/jira/lib/attachments"
import { formatFileSize, formatList } from "@/features/jira/lib/format"
import { m } from "@/paraglide/messages"

import type { JiraImportForm } from "./opts"

type Attachment = JiraMigrationRequirements["attachments"][number]

const LISTED_FILES = 50

const skipReasons: Readonly<Record<JiraAttachmentSkip, () => string>> = {
  empty: m.jira_import_attachment_empty,
  too_large: m.jira_import_attachment_larger,
  unsupported_type: m.jira_import_attachment_unsupported,
  unavailable: m.jira_import_attachment_unavailable
}

const skipCounts: Readonly<
  Record<JiraAttachmentSkip, (inputs: { count: number }) => string>
> = {
  empty: m.jira_import_attachment_count_empty,
  too_large: m.jira_import_attachment_count_larger,
  unsupported_type: m.jira_import_attachment_count_unsupported,
  unavailable: m.jira_import_attachment_count_unavailable
}

const skipSummary = (attachments: ReadonlyArray<Attachment>): string =>
  m.jira_import_attachment_skipped_summary({
    count: attachments.length,
    reasons: formatList(
      attachmentSkipCounts(attachments).map(({ skip, count }) =>
        skipCounts[skip]({ count })
      )
    )
  })

export function SkippedAttachments({
  forced
}: Readonly<{ forced: ReadonlyArray<Attachment> }>) {
  const [expanded, setExpanded] = useState(false)
  const listed = forced.slice(0, LISTED_FILES)
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="max-w-[65ch] text-[13px] text-foreground">
          {skipSummary(forced)}
        </p>
        <Button
          variant="ghost"
          size="sm"
          bleed="end"
          className="shrink-0"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded
            ? m.jira_import_attachment_hide_files()
            : m.jira_import_attachment_show_files({ count: forced.length })}
        </Button>
      </div>
      <AutoHeight>
        {expanded ? (
          <div className="flex flex-col gap-2">
            <FactList>
              {listed.map((attachment) => {
                const skip = attachmentSkip(attachment)
                return (
                  <FactRow
                    key={attachment.jiraAttachmentId}
                    label={formatFileSize(attachment.byteSize)}
                    note={skip === null ? undefined : skipReasons[skip]()}
                  >
                    <span className="font-mono break-all">
                      {attachment.filename}
                    </span>
                  </FactRow>
                )
              })}
            </FactList>
            {forced.length > listed.length ? (
              <p className="text-[13px] text-muted-foreground">
                {m.jira_import_attachment_more({
                  count: forced.length - listed.length
                })}
              </p>
            ) : null}
          </div>
        ) : null}
      </AutoHeight>
    </div>
  )
}

export function FailedAttachments({
  form,
  failed,
  commit
}: Readonly<{
  form: JiraImportForm
  failed: ReadonlyArray<Attachment>
  commit: () => void
}>) {
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="text-[13px] text-foreground">
        {m.jira_import_attachment_failed_title()}
      </p>
      <p className="max-w-[65ch] text-xs text-muted-foreground">
        {m.jira_import_attachment_failed_description()}
      </p>
      <form.Field name="review.skippedAttachmentIds">
        {(field) => (
          <ul className="flex flex-col">
            {failed.map((attachment) => (
              <li key={attachment.jiraAttachmentId}>
                <label className="flex h-9 cursor-pointer items-center gap-3 text-[13px]">
                  <Checkbox
                    checked={field.value.includes(attachment.jiraAttachmentId)}
                    onCheckedChange={(checked) => {
                      field.handleChange(
                        checked
                          ? [
                              ...new Set([
                                ...field.value,
                                attachment.jiraAttachmentId
                              ])
                            ]
                          : field.value.filter(
                              (id) => id !== attachment.jiraAttachmentId
                            )
                      )
                      commit()
                    }}
                  />
                  <span className="min-w-0 truncate font-mono">
                    {attachment.filename}
                  </span>
                  <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
                    {formatFileSize(attachment.byteSize)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </form.Field>
    </div>
  )
}
