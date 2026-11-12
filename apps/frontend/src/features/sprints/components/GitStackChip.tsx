import type { GitState, StackLayerState } from "@pp/shared"
import { Layers } from "lucide-react"

import {
  layerTone,
  stackSummary,
  TONES
} from "@/features/github/components/ticket-git/TicketStack"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { CHECKS, needsAttention, reportedChecks, type Checks } from "./gitLooks"
import { GitPreview, PreviewItem, PreviewMeta } from "./GitPreview"

export function StackChip({
  own,
  stack,
  layers,
  className
}: Readonly<{
  own: GitState
  stack: ReadonlyArray<StackLayerState>
  layers: ReadonlyArray<StackLayerState>
  className: string
}>) {
  const { count, worstChecks, anyOpen } = stackSummary(own, stack)
  const checks = reportedChecks(worstChecks)
  return (
    <GitPreview
      trigger={<span className={className} />}
      preview={
        <>
          <PreviewMeta>
            <PreviewItem icon={Layers}>{m.git_stack_heading()}</PreviewItem>
            <span>{m.git_stack_count_title(count)}</span>
          </PreviewMeta>
          <ul className="flex flex-col">
            {layers.map((layer) => (
              <StackLayerRow key={layer.branch} layer={layer} />
            ))}
          </ul>
        </>
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
    </GitPreview>
  )
}

function StackLayerRow({ layer }: Readonly<{ layer: StackLayerState }>) {
  const tone = layerTone(layer)
  const { icon: Icon, className, label } = TONES[tone]
  const checks = reportedChecks(layer.pr?.checks ?? undefined)
  return (
    <li className="flex min-w-0 items-center gap-2 py-1 text-body text-muted-foreground">
      <Icon
        aria-hidden
        className={cn("size-3.5 shrink-0", className)}
        strokeWidth={1.75}
      />
      <span className="sr-only">{label()}</span>
      {layer.pr === null ? (
        <span className="min-w-0 truncate font-mono text-caption">
          {layer.branch}
        </span>
      ) : (
        <>
          <span className="shrink-0 font-mono text-caption tabular-nums">
            #{layer.pr.number}
          </span>
          <span className="min-w-0 flex-1 truncate text-foreground">
            {layer.pr.title === "" ? layer.branch : layer.pr.title}
          </span>
        </>
      )}
      {tone !== "merged" && needsAttention(checks) && (
        <ChecksIcon checks={checks} />
      )}
    </li>
  )
}

function ChecksIcon({ checks }: Readonly<{ checks: Checks }>) {
  const { icon: Icon, tone, motion, label } = CHECKS[checks]
  return (
    <>
      <Icon
        aria-hidden
        className={cn("size-3 shrink-0", tone, motion)}
        strokeWidth={1.75}
      />
      <span className="sr-only">{label()}</span>
    </>
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
