import { Flag, Trophy, Zap } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { sprintState } from "@projectproject/shared"
import type { Group } from "@projectproject/shared"

type SprintStateName = ReturnType<typeof sprintState>

export const SPRINT_STATE_META: Record<
  SprintStateName,
  { icon: LucideIcon; className: string }
> = {
  planned: { icon: Flag, className: "text-muted-foreground" },
  active: { icon: Zap, className: "text-blue-500" },
  completed: { icon: Trophy, className: "text-emerald-500" }
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
  size?: "xs" | "sm"
}) {
  const state = sprintState(sprint, now)
  const { icon: Icon, className: stateClass } = SPRINT_STATE_META[state]
  return (
    <Icon
      className={cn(
        "shrink-0",
        size === "xs" ? "size-3" : "size-3.5",
        stateClass,
        className
      )}
      strokeWidth={1.75}
      aria-hidden
    />
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
        "inline-flex max-w-[14ch] items-center gap-1.5 truncate text-xs text-muted-foreground transition-colors group-hover/hitbox:text-foreground",
        className
      )}
    >
      <SprintStateIcon sprint={sprint} size="xs" />
      <span className="truncate">{sprint.name}</span>
    </span>
  )
}
