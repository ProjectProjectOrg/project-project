import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  CircleDot,
  CircleDotDashed,
  Flag,
  Minus,
  Trophy,
  Zap,
  type IconType
} from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"

import type { Priority, SprintState, Status } from "../data"

// The app's own marks: features/tickets/lib/ticketMeta (status),
// lib/priorityMeta (priority) and features/sprints/components/SprintChip.
const STATUS: Readonly<Record<Status, [IconType, string]>> = {
  todo: [CircleDashed, "text-muted-foreground"],
  progress: [CircleDot, "text-state-info"],
  review: [CircleDotDashed, "text-state-merged"],
  done: [Check, "text-state-success"]
}

const PRIORITY: Readonly<Record<Priority, [IconType, string]>> = {
  low: [ChevronDown, "text-muted-foreground"],
  med: [Minus, "text-state-warning"],
  high: [ChevronUp, "text-state-danger"]
}

const SPRINT: Readonly<Record<SprintState, [IconType, string]>> = {
  planned: [Flag, "text-muted-foreground"],
  active: [Zap, "text-state-info"],
  completed: [Trophy, "text-state-success"]
}

type MarkProps = Readonly<{ className?: string }>

export function StatusIcon({
  status,
  className
}: MarkProps & Readonly<{ status: Status }>) {
  const [Icon, tone] = STATUS[status]
  return (
    <Icon
      aria-hidden
      strokeWidth={1.75}
      className={cn("size-3.5 shrink-0", tone, className)}
    />
  )
}

export function PriorityIcon({
  priority,
  className
}: MarkProps & Readonly<{ priority: Priority }>) {
  const [Icon, tone] = PRIORITY[priority]
  return (
    <Icon
      aria-hidden
      strokeWidth={1.75}
      className={cn("size-3.5 shrink-0", tone, className)}
    />
  )
}

export function SprintIcon({
  state,
  className
}: MarkProps & Readonly<{ state: SprintState }>) {
  const [Icon, tone] = SPRINT[state]
  return (
    <Icon
      aria-hidden
      strokeWidth={1.75}
      className={cn("size-3.5 shrink-0", tone, className)}
    />
  )
}
