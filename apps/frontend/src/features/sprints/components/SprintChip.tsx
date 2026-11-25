import { sprintState } from "@pp/shared"
import type { Group } from "@pp/shared"
import { cn } from "@pp/ui/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@pp/ui/tooltip"
import * as DateTime from "effect/DateTime"
import * as Match from "effect/Match"

import { sprintEnded } from "@/features/sprints/lib/sprintDates"
import {
  SPRINT_STATE_META,
  sprintStateLabel,
  sprintStatusText,
  type SprintStateName,
  type SprintTiming
} from "@/features/sprints/lib/sprintPresentation"
import { m } from "@/paraglide/messages"

export function SprintStateIcon({
  sprint,
  now,
  className,
  size = "sm"
}: {
  sprint: SprintTiming
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

const sprintHintText = (state: SprintStateName, status: string | null) =>
  status === null
    ? sprintStateLabel(state)
    : state === "completed"
      ? status
      : `${sprintStateLabel(state)} · ${status}`

export function SprintStateHint({ sprint }: { sprint: Group }) {
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const status = sprintStatusText(sprint, now)
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="grid place-items-center" />}>
        <SprintStateIcon sprint={sprint} now={now} size="md" />
      </TooltipTrigger>
      <TooltipContent>
        {sprintHintText(sprintState(sprint, now), status)}
      </TooltipContent>
    </Tooltip>
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
