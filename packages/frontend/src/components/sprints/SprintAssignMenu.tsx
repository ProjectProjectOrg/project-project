import { Plus, X } from "lucide-react"
import { type ReactNode } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import {
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState,
  type Group
} from "@projectproject/shared"
import { SprintStateIcon } from "./SprintChip"

const RANGE_FMT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric"
})

function rangeText(s: Group): string {
  if (!s.startsAt || !s.endsAt) return ""
  return `${RANGE_FMT.format(s.startsAt)} – ${RANGE_FMT.format(s.endsAt)}`
}

export type SprintAssignMenuProps = {
  trigger: ReactNode
  sprints: ReadonlyArray<Group>
  selectedId: Group["id"] | null
  onSelect: (sprint: Group) => void
  onClear?: () => void
  onRequestNewSprint?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCloseAutoFocus?: (e: Event) => void
  clearLabel?: string
}

export function pickDefaultSprint(
  sprints: ReadonlyArray<Group>,
  now: Date = new Date()
): Group | null {
  return (
    pickActiveSprint(sprints, now) ??
    pickEarliestPlannedSprint(sprints, now) ??
    null
  )
}

export function SprintAssignMenu({
  trigger,
  sprints,
  selectedId,
  onSelect,
  onClear,
  onRequestNewSprint,
  open,
  onOpenChange,
  onCloseAutoFocus,
  clearLabel
}: SprintAssignMenuProps) {
  const now = new Date()
  const eligible = sprints
    .filter((s) => s.completedAt === null)
    .slice()
    .sort((a, b) => {
      const stateOrder = { active: 0, planned: 1, completed: 2 } as const
      const sa = stateOrder[sprintState(a, now)]
      const sb = stateOrder[sprintState(b, now)]
      if (sa !== sb) return sa - sb
      return (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0)
    })

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-64"
        onClick={(e) => e.stopPropagation()}
        onCloseAutoFocus={
          onCloseAutoFocus ?? ((e) => e.preventDefault())
        }
      >
        {eligible.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">
            {m.tickets_sprint_popover_empty()}
          </div>
        ) : (
          <>
            <div className="px-2 pb-1.5 pt-1 text-[11px] text-muted-foreground">
              {m.tickets_sprint_popover_title()}
            </div>
            {eligible.map((s) => {
              const isCurrent = selectedId === s.id
              return (
                <DropdownMenuItem
                  key={s.id}
                  onSelect={() => {
                    if (!isCurrent) onSelect(s)
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2",
                    isCurrent && "bg-accent/40"
                  )}
                >
                  <SprintStateIcon sprint={s} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {s.name}
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {rangeText(s)}
                  </span>
                </DropdownMenuItem>
              )
            })}
          </>
        )}
        {(onRequestNewSprint || onClear) && <DropdownMenuSeparator />}
        {onRequestNewSprint && (
          <DropdownMenuItem
            onSelect={() => onRequestNewSprint()}
            className="cursor-pointer"
          >
            <Plus className="size-3.5" strokeWidth={1.75} />
            {m.tickets_sprint_popover_new_sprint_action()}
          </DropdownMenuItem>
        )}
        {onClear && (
          <DropdownMenuItem
            onSelect={() => onClear()}
            className={cn(
              "flex cursor-pointer items-center gap-2 text-muted-foreground",
              !selectedId && "bg-accent/40 text-foreground"
            )}
          >
            <X className="size-3.5" strokeWidth={1.75} />
            {clearLabel ?? m.tickets_sprint_popover_remove_action()}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
