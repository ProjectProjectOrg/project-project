import type { JiraMigrationDetail } from "@projectproject/shared"
import { Clock3, LoaderCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function JiraProgressStep({
  detail,
  waiting,
  error,
  onCancel
}: {
  detail: JiraMigrationDetail
  waiting: boolean
  error?: string | null
  onCancel?: () => void
}) {
  const scanning = detail.status === "scanning"
  const queued = scanning && detail.progress.phase === "queued_scan"
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
              ? queued
                ? m.jira_migration_scan_queued_title()
                : m.jira_migration_scan_progress_title()
              : m.jira_migration_work_progress_title()}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground text-pretty">
            {scanning
              ? queued
                ? m.jira_migration_scan_queued_description()
                : m.jira_migration_scan_progress_description()
              : m.jira_migration_work_progress_description()}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2 font-medium text-foreground">
              {queued ? (
                <Clock3 className="size-4 text-muted-foreground" aria-hidden />
              ) : (scanning || ratio === null) && !cancelling ? (
                <LoaderCircle
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : null}
              {queued
                ? m.jira_migration_phase_queued_scan()
                : cancelling
                  ? m.jira_migration_status_cancelling()
                  : scanning
                    ? m.jira_migration_status_scanning()
                    : m.jira_migration_status_migrating()}
            </span>
            {!queued && detail.progress.done > 0 ? (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {scanning && total === null
                  ? m.jira_migration_scan_records_captured({
                      count: detail.progress.done
                    })
                  : total === null
                    ? detail.progress.done
                    : `${detail.progress.done} / ${total}`}
              </span>
            ) : null}
          </div>
          {ratio !== null && !queued ? (
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={detail.progress.done}
              aria-valuemin={0}
              aria-valuemax={total ?? undefined}
            >
              <div
                className="h-full rounded-full bg-foreground transition-[width] duration-150 motion-reduce:transition-none"
                style={{ width: `${Math.min(100, ratio * 100)}%` }}
              />
            </div>
          ) : null}
          {!queued && !scanning ? (
            <span className="text-xs text-muted-foreground">
              {phaseLabel(detail.progress.phase)}
            </span>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
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

const phaseLabels: Record<string, () => string> = {
  queued_scan: m.jira_migration_phase_queued_scan,
  scan: m.jira_migration_phase_scan,
  configuration: m.jira_migration_phase_configuration,
  ready: m.jira_migration_phase_ready,
  migrate: m.jira_migration_phase_migrate,
  cancelling: m.jira_migration_phase_cancelling
}

function phaseLabel(phase: string): string {
  return phaseLabels[phase]?.() ?? ""
}
