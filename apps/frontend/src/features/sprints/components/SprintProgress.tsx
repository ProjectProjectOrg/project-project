import { useAtomValue } from "@effect/atom-react"
import {
  ESTIMATE_SIZES,
  sprintState,
  type EstimateSummary,
  type Group
} from "@pp/shared"
import { Chip } from "@pp/ui/chip"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@pp/ui/hover-card"
import { CircleDashed, Shirt } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

import {
  sprintTimeAtom,
  sprintTimerRequest
} from "@/features/everhour/atoms/timeTracking"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  ESTIMATE_UNIT_ICON,
  formatEstimateAmount,
  formatEstimateProgress,
  isEmptyEstimateSummary
} from "@/features/tickets/lib/estimateMeta"
import { formatWorkDuration } from "@/lib/duration"
import { m } from "@/paraglide/messages"

import { sprintStatusText } from "./SprintChip"

export const DONE_TONE = "bg-foreground/75"
export const STARTED_TONE = "bg-foreground/30"
export const UNSTARTED_TONE = "bg-tint"

export function SprintProgress({
  sprint,
  summary,
  onShowUnestimated
}: Readonly<{
  sprint: Group
  summary: EstimateSummary
  onShowUnestimated?: () => void
}>) {
  if (isEmptyEstimateSummary(summary)) return null
  const estimate = sprintEstimate(sprint, summary)
  return (
    <>
      {estimate !== null && (
        <HoverCard>
          <HoverCardTrigger
            render={<Chip interaction="hover" className="tabular-nums" />}
          >
            {estimate}
          </HoverCardTrigger>
          <HoverCardContent
            align="end"
            className="pointer-events-none flex w-64 flex-col gap-3"
          >
            <SprintPreview sprint={sprint} summary={summary} />
          </HoverCardContent>
        </HoverCard>
      )}
      {summary.unestimated > 0 && (
        <UnestimatedChip
          count={summary.unestimated}
          onShow={onShowUnestimated}
        />
      )}
    </>
  )
}

function sprintEstimate(sprint: Group, summary: EstimateSummary) {
  if (summary.unit === "tshirt") {
    const sizes = ESTIMATE_SIZES.filter((size) => summary.sizes[size] > 0)
    if (sizes.length === 0) return null
    return (
      <>
        <Shirt className="size-3 shrink-0" strokeWidth={1.75} />
        {sizes.map((size) => (
          <span key={size}>
            <span className="font-semibold text-foreground">{size}</span>
            {summary.sizes[size]}
          </span>
        ))}
      </>
    )
  }
  if (summary.committed === 0) return null
  if (sprintState(sprint) === "planned") {
    const Icon = ESTIMATE_UNIT_ICON[summary.unit]
    return (
      <>
        <Icon className="size-3 shrink-0" strokeWidth={1.75} />
        <span className="text-foreground">
          {formatEstimateAmount(summary.unit, summary.committed)}
        </span>
      </>
    )
  }
  return (
    <>
      <PhaseBar
        done={summary.done}
        started={summary.started}
        total={summary.committed}
        className="w-11"
      />
      {formatEstimateProgress(summary)}
    </>
  )
}

export function PhaseBar({
  done,
  started,
  total,
  className
}: Readonly<{
  done: number
  started: number
  total: number
  className?: string
}>) {
  const share = (amount: number) =>
    `${total === 0 ? 0 : (amount / total) * 100}%`
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-1 overflow-hidden rounded-full",
        UNSTARTED_TONE,
        className
      )}
    >
      <span className={DONE_TONE} style={{ width: share(done) }} />
      <span className={STARTED_TONE} style={{ width: share(started) }} />
    </span>
  )
}

function UnestimatedChip({
  count,
  onShow
}: Readonly<{ count: number; onShow: (() => void) | undefined }>) {
  const content = (
    <>
      <CircleDashed className="size-3 shrink-0" strokeWidth={2} />
      {count}
    </>
  )
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          onShow ? (
            <Chip
              interaction="press"
              aria-label={m.tickets_estimate_unestimated_filter()}
              onClick={(event) => {
                event.stopPropagation()
                onShow()
              }}
              className="text-state-warning tabular-nums hover:text-state-warning"
            />
          ) : (
            <Chip className="text-state-warning tabular-nums" />
          )
        }
      >
        {content}
      </TooltipTrigger>
      <TooltipContent>
        {m.tickets_estimate_unestimated_hint({ count })}
        {onShow && (
          <div className="text-muted-foreground">
            {m.tickets_estimate_unestimated_filter()}
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

function SprintPreview({
  sprint,
  summary
}: Readonly<{ sprint: Group; summary: EstimateSummary }>) {
  const status = sprintStatusText(sprint, DateTime.toDate(DateTime.nowUnsafe()))
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-body font-semibold">{sprint.name}</span>
        {status !== null && (
          <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
            {status}
          </span>
        )}
      </div>
      <PreviewEstimate sprint={sprint} summary={summary} />
      {summary.unestimated > 0 && (
        <PreviewRows>
          <PreviewRow
            marker={
              <CircleDashed
                className="size-3 text-state-warning"
                strokeWidth={2}
              />
            }
            label={m.tickets_estimate_breakdown_unestimated()}
          >
            {m.tickets_estimate_breakdown_tickets({
              count: summary.unestimated
            })}
          </PreviewRow>
        </PreviewRows>
      )}
      <SprintLoggedTime sprint={sprint} />
    </>
  )
}

function PreviewEstimate({
  sprint,
  summary
}: Readonly<{ sprint: Group; summary: EstimateSummary }>) {
  if (summary.unit === "tshirt") {
    const sizes = ESTIMATE_SIZES.filter((size) => summary.sizes[size] > 0)
    if (sizes.length === 0) return null
    return (
      <PreviewRows>
        {sizes.map((size) => (
          <PreviewRow
            key={size}
            marker={<Shirt className="size-3" strokeWidth={1.75} />}
            label={size}
          >
            {m.tickets_estimate_breakdown_tickets({
              count: summary.sizes[size]
            })}
          </PreviewRow>
        ))}
      </PreviewRows>
    )
  }
  if (summary.committed === 0) return null
  if (sprintState(sprint) === "planned") {
    const Icon = ESTIMATE_UNIT_ICON[summary.unit]
    return (
      <PreviewRows>
        <PreviewRow
          marker={<Icon className="size-3" strokeWidth={1.75} />}
          label={m.tickets_estimate_breakdown_total()}
        >
          {formatEstimateAmount(summary.unit, summary.committed)}
        </PreviewRow>
      </PreviewRows>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      <PhaseBar
        done={summary.done}
        started={summary.started}
        total={summary.committed}
        className="w-full"
      />
      <PreviewRows>
        <PreviewRow
          marker={<ToneDot tone={DONE_TONE} />}
          label={m.tickets_estimate_breakdown_done()}
        >
          {formatEstimateAmount(summary.unit, summary.done)}
        </PreviewRow>
        <PreviewRow
          marker={<ToneDot tone={STARTED_TONE} />}
          label={m.tickets_estimate_breakdown_started()}
        >
          {formatEstimateAmount(summary.unit, summary.started)}
        </PreviewRow>
        <PreviewRow
          marker={<ToneDot tone={UNSTARTED_TONE} />}
          label={m.tickets_estimate_breakdown_unstarted()}
        >
          {formatEstimateAmount(
            summary.unit,
            summary.committed - summary.done - summary.started
          )}
        </PreviewRow>
      </PreviewRows>
    </div>
  )
}

function SprintLoggedTime({ sprint }: Readonly<{ sprint: Group }>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(
    sprintTimeAtom(sprintTimerRequest(orgSlug, slug, sprint.id))
  )
  if (!Result.isSuccess(result) || result.value === null) return null
  const { totalSeconds, userSeconds } = result.value
  return (
    <div className="border-t border-border pt-3">
      <PreviewRows>
        <PreviewRow marker={null} label={m.time_tracked_total()}>
          {formatWorkDuration(totalSeconds)}
        </PreviewRow>
        {userSeconds > 0 && (
          <PreviewRow marker={null} label={m.time_tracked_yours()}>
            {formatWorkDuration(userSeconds)}
          </PreviewRow>
        )}
      </PreviewRows>
    </div>
  )
}

function PreviewRows({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-1 text-caption">
      {children}
    </div>
  )
}

function ToneDot({ tone }: Readonly<{ tone: string }>) {
  return <span className={cn("size-2 rounded-full", tone)} />
}

function PreviewRow({
  marker,
  label,
  children
}: Readonly<{ marker: ReactNode; label: string; children: ReactNode }>) {
  return (
    <>
      <span className="grid size-3 place-items-center" aria-hidden>
        {marker}
      </span>
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right tabular-nums">{children}</span>
    </>
  )
}
