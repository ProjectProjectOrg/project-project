import { cn } from "@/lib/utils"
import { sprintState } from "@projectproject/shared"
import type { Group } from "@projectproject/shared"

export const SPRINT_DOT_CLASS: Record<
  ReturnType<typeof sprintState>,
  string
> = {
  active: "bg-foreground",
  planned: "bg-muted-foreground/40",
  completed: "bg-muted-foreground"
}

export function SprintStateDot({
  sprint,
  now,
  className
}: {
  sprint: Group
  now?: Date
  className?: string
}) {
  const state = sprintState(sprint, now)
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        SPRINT_DOT_CLASS[state],
        className
      )}
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
      <SprintStateDot sprint={sprint} />
      <span className="truncate">{sprint.name}</span>
    </span>
  )
}
