import type { JiraMigrationScanSummary } from "@projectproject/shared"
import { ArrowRight, Database } from "lucide-react"
import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export function JiraSnapshotStep({
  summary,
  onContinue
}: {
  summary: JiraMigrationScanSummary
  onContinue?: () => void
}) {
  const counts = [
    [m.jira_migration_snapshot_issues(), summary.counts.issues],
    [m.jira_migration_snapshot_comments(), summary.counts.comments],
    [m.jira_migration_snapshot_people(), summary.counts.identities],
    [m.jira_migration_snapshot_attachments(), summary.counts.attachments],
    [m.jira_migration_snapshot_groups(), summary.counts.groups]
  ] as const

  return (
    <div className="flex min-h-[520px] flex-col">
      <div className="flex flex-1 flex-col gap-7 px-5 py-6 sm:px-8 sm:py-8">
        <div className="max-w-[65ch]">
          <h2 className="text-xl font-semibold tracking-tight text-foreground text-balance">
            {m.jira_migration_snapshot_title()}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground text-pretty">
            {m.jira_migration_snapshot_description()}
          </p>
        </div>

        <div className="flex items-center gap-3 border-b border-border pb-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
            <Database className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {summary.projectName}
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              {summary.projectKey} · {summary.siteName}
            </div>
          </div>
        </div>

        <dl className="divide-y divide-border">
          {counts.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 py-3 text-sm"
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-mono tabular-nums text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>

        {summary.visibilityWarnings.length > 0 ? (
          <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
            {summary.visibilityWarnings.map((warning) => (
              <div key={`${warning.category}:${warning.label}`}>
                <p className="text-sm font-medium">{warning.label}</p>
                {warning.detail ? (
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {warning.detail}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        <p className="text-xs text-muted-foreground">
          {m.jira_migration_snapshot_project_destination()}
        </p>
      </div>
      <div className="flex justify-end border-t border-border px-5 py-4 sm:px-8">
        <Button trailingIcon={ArrowRight} onClick={onContinue}>
          {m.jira_migration_action_continue()}
        </Button>
      </div>
    </div>
  )
}
