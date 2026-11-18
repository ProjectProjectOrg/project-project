import {
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState,
  type Group
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import { Plus, X } from "lucide-react"
import type { ComponentProps, ReactElement } from "react"

import { menuItemMetaClass } from "@/components/ui/menu-styles"
import { Select, SelectTrigger } from "@/components/ui/select"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { SprintStateIcon } from "./SprintChip"

type SelectProps = ComponentProps<typeof Select>

const NO_SPRINT = "__no-sprint"
const NEW_SPRINT = "__new-sprint"

function rangeText(s: Group): string {
  if (!s.startsAt || !s.endsAt) return ""
  const fmt = new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric"
  })
  return `${fmt.format(s.startsAt)} – ${fmt.format(s.endsAt)}`
}

export type SprintAssignMenuProps = {
  trigger: ReactElement
  sprints: ReadonlyArray<Group>
  selectedId: Group["id"] | null
  onSelect: (sprint: Group) => void
  onClear?: () => void
  onRequestNewSprint?: () => void
  open?: boolean
  onOpenChange?: SelectProps["onOpenChange"]
  finalFocus?: NonNullable<SelectProps["contentProps"]>["finalFocus"]
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

const eligibleSprints = (sprints: ReadonlyArray<Group>) => {
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const stateOrder = { active: 0, planned: 1, completed: 2 } as const
  return sprints
    .filter((s) => s.completedAt === null)
    .toSorted((a, b) => {
      const sa = stateOrder[sprintState(a, now)]
      const sb = stateOrder[sprintState(b, now)]
      if (sa !== sb) return sa - sb
      return (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0)
    })
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
  const eligible = eligibleSprints(sprints)
  const sprintOptions = eligible.map((s, index) => ({
    value: s.id,
    textValue: s.name,
    separated:
      index === eligible.length - 1 &&
      (onClear !== undefined || onRequestNewSprint !== undefined),
    label: (
      <>
        <SprintStateIcon sprint={s} size="xs" />
        <span className="min-w-0 flex-1 truncate">{s.name}</span>
        <span data-menu-meta className={menuItemMetaClass}>
          {rangeText(s)}
        </span>
      </>
    )
  }))
  const clearText = clearLabel ?? m.tickets_sprint_popover_remove_action()
  const clearOptions =
    onClear === undefined
      ? []
      : [
          {
            value: NO_SPRINT,
            textValue: clearText,
            label: (
              <>
                <X strokeWidth={1.75} />
                {clearText}
              </>
            )
          }
        ]
  const newSprintText = m.tickets_sprint_popover_new_sprint_action()
  const actionOptions =
    onRequestNewSprint === undefined
      ? []
      : [
          {
            value: NEW_SPRINT,
            textValue: newSprintText,
            label: (
              <>
                <Plus strokeWidth={1.75} />
                {newSprintText}
              </>
            ),
            onAction: onRequestNewSprint
          }
        ]
  const items = [...sprintOptions, ...clearOptions, ...actionOptions]
  return (
    <Select
      items={items}
      value={selectedId ?? (onClear === undefined ? null : NO_SPRINT)}
      open={open}
      onOpenChange={onOpenChange}
      onValueChange={(id) => {
        if (id === NO_SPRINT) {
          if (selectedId !== null) onClear?.()
          return
        }
        const next = eligible.find((s) => s.id === id)
        if (next && id !== selectedId) onSelect(next)
      }}
      contentProps={{
        align: "start",
        className: "w-64",
        finalFocus: finalFocus ?? false
      }}
    >
      <SelectTrigger render={trigger} />
    </Select>
  )
}
