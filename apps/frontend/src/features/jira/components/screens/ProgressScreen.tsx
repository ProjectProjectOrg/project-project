import { Check, Circle, LoaderCircle } from "lucide-react"

import { formatNumber } from "@/features/jira/lib/format"
import {
  jiraImportPhaseLabel,
  type JiraPhaseStep
} from "@/features/jira/lib/phases"
import type {
  JiraScanCount,
  JiraScanCountLine
} from "@/features/jira/lib/scanCounts"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { ConfirmAction } from "../ConfirmAction"
import { IconSwap } from "../IconSwap"
import { ProgressBar } from "../ProgressBar"
import { StepFrame } from "../StepFrame"

export type ProgressCancel = Readonly<{
  trigger: string
  prompt: string
  label: string
  onConfirm: () => Promise<boolean>
}>

export function ProgressScreen({
  title,
  description,
  phases,
  count,
  ratio,
  scanCounts,
  error,
  waiting,
  cancel
}: Readonly<{
  title: string
  description: string
  phases: ReadonlyArray<JiraPhaseStep>
  count: string | null
  ratio: number | null
  scanCounts?: JiraScanCountLine
  error: string | null
  waiting: boolean
  cancel: ProgressCancel | null
}>) {
  return (
    <StepFrame
      title={title}
      description={description}
      error={error}
      end={
        cancel === null ? undefined : (
          <ConfirmAction {...cancel} disabled={waiting} />
        )
      }
    >
      <div className="flex flex-col gap-4" aria-live="polite">
        <ol className="flex flex-col gap-1">
          {phases.map((step) => (
            <PhaseRow
              key={step.phase}
              step={step}
              count={step.measured ? count : null}
              ratio={step.measured ? ratio : null}
            />
          ))}
        </ol>
        {scanCounts === undefined ||
        scanCounts.primary.length + scanCounts.secondary.length === 0 ? null : (
          <ScanCounts line={scanCounts} />
        )}
        <p className="max-w-[65ch] text-caption text-muted-foreground">
          {m.jira_import_leave_note()}
        </p>
      </div>
    </StepFrame>
  )
}

function PhaseRow({
  step,
  count,
  ratio
}: Readonly<{
  step: JiraPhaseStep
  count: string | null
  ratio: number | null
}>) {
  const label = jiraImportPhaseLabel(step.phase)
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex h-7 items-center justify-between gap-4 text-body">
        <span
          className={cn(
            "flex min-w-0 items-center gap-2",
            step.state === "pending"
              ? "text-muted-foreground"
              : "text-foreground"
          )}
        >
          <IconSwap
            showSecond={step.state === "done"}
            first={
              step.state === "current" ? (
                <LoaderCircle
                  className="size-4 animate-spin motion-reduce:animate-none"
                  strokeWidth={1.75}
                  aria-hidden
                />
              ) : (
                <Circle className="size-3" strokeWidth={1.75} aria-hidden />
              )
            }
            second={<Check className="size-4" strokeWidth={1.75} aria-hidden />}
          />
          <span className="truncate">{label}</span>
        </span>
        {count === null ? null : (
          <span className="shrink-0 text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </div>
      {ratio === null ? null : (
        <div className="pl-6">
          <ProgressBar ratio={ratio} label={label} />
        </div>
      )}
    </li>
  )
}

function ScanCounts({ line }: Readonly<{ line: JiraScanCountLine }>) {
  return (
    <div
      aria-label={m.jira_import_scan_counts_label()}
      className="flex flex-col gap-1 pl-6"
    >
      <p className="flex flex-wrap gap-x-5 gap-y-1 text-body text-foreground">
        {line.primary.map((entry) => (
          <CountEntry key={entry.kind} entry={entry} />
        ))}
      </p>
      {line.secondary.length === 0 ? null : (
        <p className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-muted-foreground">
          {line.secondary.map((entry) => (
            <CountEntry key={entry.kind} entry={entry} />
          ))}
        </p>
      )}
    </div>
  )
}

function CountEntry({ entry }: Readonly<{ entry: JiraScanCount }>) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="tabular-nums">{formatNumber(entry.count)}</span>
      <span>{entry.label}</span>
    </span>
  )
}
