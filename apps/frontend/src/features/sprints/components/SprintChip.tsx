import { sprintState } from "@pp/shared"
import type { Group } from "@pp/shared"
import * as Match from "effect/Match"
import { Flag, Trophy, Zap } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import {
  sprintEnded,
  type SprintCountdown
} from "@/features/sprints/lib/sprintDates"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type SprintStateName = ReturnType<typeof sprintState>

export const SPRINT_STATE_META: Record<
  SprintStateName,
  { icon: LucideIcon; className: string }
> = {
  planned: { icon: Flag, className: "text-muted-foreground" },
  active: { icon: Zap, className: "text-state-info" },
  completed: { icon: Trophy, className: "text-state-success" }
}

export function SprintStateIcon({
  sprint,
  now,
  className,
  size = "sm"
}: {
  sprint: Group
  now?: Date
  className?: string
  size?: "xs" | "sm" | "md" | "lg"
}) {
  const state = sprintState(sprint, now)
  const { icon: Icon, className: stateClass } = SPRINT_STATE_META[state]
  const ended = sprintEnded(sprint, now)
  return (
    <>
      <Icon
        className={cn(
          "shrink-0",
          Match.value(size).pipe(
            Match.when("xs", () => "size-3"),
            Match.when("sm", () => "size-3.5"),
            Match.when("lg", () => "size-5"),
            Match.orElse(() => "size-4")
          ),
          ended ? "text-state-warning" : stateClass,
          className
        )}
        strokeWidth={1.75}
        aria-hidden
      />
      {ended && <span className="sr-only">{m.sprints_state_ended()}</span>}
    </>
  )
}

export function SprintChip({
  sprint,
  className
}: {
  sprint: Group
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-[14ch] items-center gap-1.5 truncate text-caption text-muted-foreground transition-colors hitbox-hover:text-foreground",
        className
      )}
    >
      <SprintStateIcon sprint={sprint} size="xs" />
      <span className="truncate">{sprint.name}</span>
    </span>
  )
}

export const countdownLabel = (countdown: SprintCountdown): string =>
  Match.value(countdown).pipe(
    Match.discriminatorsExhaustive("kind")({
      noEnd: () => m.sprints_no_end_date(),
      left: ({ days }) => m.sprints_active_with_days_left({ days }),
      lastDay: () => m.sprints_last_day(),
      ended: ({ days }) => m.sprints_ended_days_ago({ days })
    })
  )
