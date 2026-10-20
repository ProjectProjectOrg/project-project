import * as DateTime from "effect/DateTime"
import { Plus, X } from "lucide-react"
import { type ComponentProps } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { menuItemMetaClass } from "@/components/ui/menu-styles"

type TriggerRender = ComponentProps<typeof DropdownMenuTrigger>["render"]
import {
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState,
  type Group
} from "@pp/shared"

import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { SprintStateIcon } from "./SprintChip"

function rangeText(s: Group): string {
  if (!s.startsAt || !s.endsAt) return ""
  const fmt = new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric"
  })
  return `${fmt.format(s.startsAt)} – ${fmt.format(s.endsAt)}`
}

export type SprintAssignMenuProps = {
  trigger: TriggerRender
  sprints: ReadonlyArray<Group>
  selectedId: Group["id"] | null
  onSelect: (sprint: Group) => void
  onClear?: () => void
  onRequestNewSprint?: () => void
  open?: boolean
  onOpenChange?: ComponentProps<typeof DropdownMenu>["onOpenChange"]
  finalFocus?: ComponentProps<typeof DropdownMenuContent>["finalFocus"]
  clearLabel?: string
}

export function pickDefaultSprint(
  sprints: ReadonlyArray<Group>,
  now: Date = DateTime.toDate(DateTime.nowUnsafe())
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
  finalFocus,
  clearLabel
}: SprintAssignMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-64"
        onClick={(e) => e.stopPropagation()}
        finalFocus={finalFocus ?? false}
      >
        <SprintAssignMenuItems
          sprints={sprints}
          selectedId={selectedId}
          onSelect={onSelect}
          onClear={onClear}
          onRequestNewSprint={onRequestNewSprint}
          clearLabel={clearLabel}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SprintAssignMenuItems({
  sprints,
  selectedId,
  onSelect,
  onClear,
  onRequestNewSprint,
  clearLabel
}: Pick<
  SprintAssignMenuProps,
  | "sprints"
  | "selectedId"
  | "onSelect"
  | "onClear"
  | "onRequestNewSprint"
  | "clearLabel"
>) {
  const now = DateTime.toDate(DateTime.nowUnsafe())
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
    <>
      <div className="px-2 pt-1 pb-1.5 text-[11px] text-muted-foreground">
        {m.tickets_sprint_popover_title()}
      </div>
      <DropdownMenuRadioGroup
        value={selectedId}
        onValueChange={(id: Group["id"]) => {
          const next = eligible.find((s) => s.id === id)
          if (next && id !== selectedId) onSelect(next)
        }}
      >
        {eligible.map((s) => (
          <DropdownMenuRadioItem key={s.id} value={s.id} closeOnClick>
            <SprintStateIcon sprint={s} size="xs" />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span data-menu-meta className={menuItemMetaClass}>
              {rangeText(s)}
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
      {(onRequestNewSprint || onClear) && <DropdownMenuSeparator />}
      {onRequestNewSprint && (
        <DropdownMenuItem onClick={() => onRequestNewSprint()}>
          <Plus strokeWidth={1.75} />
          {m.tickets_sprint_popover_new_sprint_action()}
        </DropdownMenuItem>
      )}
      {onClear && (
        <DropdownMenuItem onClick={() => onClear()}>
          <X strokeWidth={1.75} />
          {clearLabel ?? m.tickets_sprint_popover_remove_action()}
        </DropdownMenuItem>
      )}
    </>
  )
}
