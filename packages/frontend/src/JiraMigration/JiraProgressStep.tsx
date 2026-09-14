import type { JiraMigrationDetail } from "@projectproject/shared"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function JiraProgressStep({
  detail,
  waiting,
  onCancel
}: {
  detail: JiraMigrationDetail
  waiting: boolean
  onCancel?: () => void
}) {
  const scanning = detail.status === "scanning"
  const cancelling = detail.status === "cancelling"
  const total = detail.progress.total
  const ratio = total && total > 0 ? detail.progress.done / total : null

  return (
    <div className="flex min-h-[520px] flex-col">
      <div
        className={cn(
          "flex flex-1 flex-col gap-8 px-5 py-6 sm:px-8 sm:py-8",
          waiting && "animate-pulse"
        )}
        aria-live="polite"
      >
        <div className="max-w-[65ch]">
          <h2 className="text-xl font-semibold tracking-tight text-foreground text-balance">
            {scanning
              ? m.jira_migration_scan_progress_title()
              : m.jira_migration_work_progress_title()}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground text-pretty">
            {scanning
              ? m.jira_migration_scan_progress_description()
              : m.jira_migration_work_progress_description()}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="font-medium text-foreground">
              {cancelling
                ? m.jira_migration_status_cancelling()
                : scanning
                  ? m.jira_migration_status_scanning()
                  : m.jira_migration_status_migrating()}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {total === null
                ? detail.progress.done
                : `${detail.progress.done} / ${total}`}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={detail.progress.done}
            aria-valuemin={0}
            aria-valuemax={total ?? undefined}
          >
            <div
              className={cn(
                "h-full rounded-full bg-foreground transition-[width] duration-150 motion-reduce:transition-none",
                ratio === null && "w-1/3 animate-pulse"
              )}
              style={ratio === null ? undefined : { width: `${ratio * 100}%` }}
            />
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {detail.progress.phase}
          </span>
        </div>
      </div>

      {detail.actions.canCancel ? (
        <div className="flex justify-end border-t border-border px-5 py-4 sm:px-8">
          <Button variant="tertiary" disabled={waiting} onClick={onCancel}>
            {m.jira_migration_action_cancel()}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
