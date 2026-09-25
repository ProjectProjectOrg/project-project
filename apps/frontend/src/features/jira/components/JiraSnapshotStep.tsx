import type { JiraMigrationScanSummary } from "@pp/shared"
import { Boxes, Info, Paperclip, UsersRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export function JiraSnapshotStep({
  summary,
  onBack,
  onContinue
}: {
  summary: JiraMigrationScanSummary
  onBack?: () => void
  onContinue?: () => void
}) {
  const hasScanGaps = summary.visibilityWarnings.some(
    ({ detail }) => detail !== "jira-permissions"
  )
  const groups = [
    {
      label: m.jira_migration_snapshot_people_data(),
      detail: m.jira_migration_snapshot_people_data_counts({
        people: summary.counts.identities,
        statuses: summary.counts.statuses,
        types: summary.counts.issueTypes,
        priorities: summary.counts.priorities
      }),
      icon: UsersRound
    },
    {
      label: m.jira_migration_snapshot_planning(),
      detail: m.jira_migration_snapshot_planning_counts({
        issues: summary.counts.issues,
        comments: summary.counts.comments,
        groups: summary.counts.groups,
        tags: summary.counts.tags
      }),
      icon: Boxes
    },
    {
      label: m.jira_migration_snapshot_attachments(),
      detail: m.jira_migration_snapshot_attachment_counts({
        attachments: summary.counts.attachments
      }),
      icon: Paperclip
    }
  ] as const

  return (
    <div className="flex min-h-[650px] flex-col">
      <div className="flex flex-1 flex-col gap-6 pt-1 pb-8">
        <div className="max-w-[65ch]">
          <h2 className="text-lg font-semibold tracking-tight text-balance text-foreground">
            {m.jira_migration_snapshot_title()}
          </h2>
          <p className="mt-1.5 text-sm leading-[21px] text-pretty text-muted-foreground">
            {m.jira_migration_snapshot_description({
              issues: summary.counts.issues,
              project: summary.projectName
            })}
          </p>
        </div>

        <dl className="divide-y divide-border">
          {groups.map(({ label, detail, icon: Icon }) => (
            <div
              key={label}
              className="grid min-h-[72px] grid-cols-[1fr_auto] items-center gap-4 py-3 text-sm"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background text-muted-foreground">
                  <Icon className="size-4" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <dt className="font-medium text-foreground">{label}</dt>
                  <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">
                    {detail}
                  </dd>
                </div>
              </div>
            </div>
          ))}
        </dl>

        {summary.visibilityWarnings.length > 0 ? (
          <div className="flex gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3">
            <Info
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                {m.jira_migration_snapshot_visibility_title()}
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                {m.jira_migration_snapshot_visibility_description()}
              </p>
              {hasScanGaps ? (
                <div className="pt-2">
                  <p className="text-sm font-medium text-foreground">
                    {m.jira_migration_snapshot_gaps_title()}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {m.jira_migration_snapshot_gaps_description()}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <p className="max-w-[65ch] text-xs leading-5 text-muted-foreground">
          {m.jira_migration_snapshot_fixed_note({
            projectKey: summary.projectKey,
            site: summary.siteName
          })}
        </p>
      </div>
      <div className="flex h-[72px] items-center justify-between border-t border-border px-4">
        {onBack ? (
          <Button variant="ghost" onClick={onBack}>
            {m.jira_migration_action_back()}
          </Button>
        ) : (
          <span />
        )}
        <Button onClick={onContinue}>
          {m.jira_migration_action_continue()}
        </Button>
      </div>
    </div>
  )
}
