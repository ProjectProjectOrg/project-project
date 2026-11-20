import type { GitState, StackLayerState } from "@pp/shared"
import { Chip } from "@pp/ui/chip"
import { Layers } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"

import { stackSummary } from "@/features/github/components/ticket-git/TicketStack"
import {
  TicketPreview,
  TicketPreviewTrigger
} from "@/features/tickets/components/ticket-preview/TicketPreview"

import { CHECKS, needsAttention, reportedChecks, type Checks } from "./gitLooks"

export function StackChip({
  own,
  stack,
  layers,
  pulse,
  repoLabel
}: Readonly<{
  own: GitState
  stack: ReadonlyArray<StackLayerState>
  layers: ReadonlyArray<StackLayerState>
  pulse: boolean
  repoLabel: string | null
}>) {
  const { count, worstChecks, anyOpen } = stackSummary(own, stack)
  const checks = reportedChecks(worstChecks)
  return (
    <TicketPreviewTrigger
      preview={TicketPreview.stack({ own, stack, layers, repo: repoLabel })}
      render={
        <Chip
          interaction="press"
          render={<span />}
          data-pending={pulse || undefined}
          className="relative z-20"
        />
      }
    >
      <Layers
        className={cn(
          "size-3 shrink-0",
          anyOpen
            ? "text-state-success"
            : count.merged > 0
              ? "text-state-merged"
              : undefined
        )}
        strokeWidth={1.75}
      />
      {count.merged}/{count.total}
      {needsAttention(checks) && <ChecksDot checks={checks} />}
    </TicketPreviewTrigger>
  )
}

export function ChecksDot({ checks }: Readonly<{ checks: Checks }>) {
  const { tone, label } = CHECKS[checks]
  return (
    <>
      <span
        aria-hidden
        className={cn("size-1.5 shrink-0 rounded-full bg-current", tone)}
      />
      <span className="sr-only">{label()}</span>
    </>
  )
}
