import {
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState,
  type Group
} from "@pp/shared"
import { CircleDashed, Plus } from "@pp/ui/icons"
import { menuItemMetaClass } from "@pp/ui/menu-styles"
import { Select, SelectTrigger } from "@pp/ui/select"
import * as DateTime from "effect/DateTime"
import type { ComponentProps, ReactElement } from "react"

import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { SprintStateIcon } from "./SprintChip"

type SelectProps = ComponentProps<typeof Select>

const NO_SPRINT = "__no-sprint"
const NEW_SPRINT = "__new-sprint"

function rangeText(s: Group) {
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
  // null: in no sprint. undefined: tickets in different sprints, so
  // nothing is marked.
  selectedId: Group["id"] | null | undefined
  onSelect: (sprint: Group | null) => void
  onRequestNewSprint?: () => void
  open?: boolean
  onOpenChange?: SelectProps["onOpenChange"]
  finalFocus?: NonNullable<SelectProps["contentProps"]>["finalFocus"]
}

export function pickDefaultSprint(
  sprints: ReadonlyArray<Group>,
  now: Date = DateTime.toDate(DateTime.nowUnsafe())
) {
  return (
    pickActiveSprint(sprints, now) ??
    pickEarliestPlannedSprint(sprints, now) ??
    null
  )
}

export const eligibleSprints = (sprints: ReadonlyArray<Group>) => {
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
  onRequestNewSprint,
  open,
  onOpenChange,
  finalFocus
}: SprintAssignMenuProps) {
  const eligible = eligibleSprints(sprints)
  const sprintOptions = eligible.map((s, index) => ({
    value: s.id,
    textValue: s.name,
    separated: index === eligible.length - 1,
    label: (
      <>
        <SprintStateIcon sprint={s} size="md" />
        <span className="min-w-0 flex-1 truncate">{s.name}</span>
        <span data-menu-meta className={menuItemMetaClass}>
          {rangeText(s)}
        </span>
      </>
    )
  }))
  const noneText = m.tickets_sprint_none()
  const noneOption = {
    value: NO_SPRINT,
    textValue: noneText,
    separated: onRequestNewSprint !== undefined,
    label: (
      <>
        <CircleDashed strokeWidth={1.75} />
        <span className="truncate">{noneText}</span>
      </>
    )
  }
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
  const items = [...sprintOptions, noneOption, ...actionOptions]
  return (
    <Select
      items={items}
      value={selectedId === undefined ? null : (selectedId ?? NO_SPRINT)}
      open={open}
      onOpenChange={onOpenChange}
      onValueChange={(id) => {
        if (id === NO_SPRINT) {
          if (selectedId !== null) onSelect(null)
          return
        }
        const next = eligible.find((s) => s.id === id)
        if (next && id !== selectedId) onSelect(next)
      }}
      contentProps={{
        align: "start",
        className: "max-w-80",
        finalFocus: finalFocus ?? false
      }}
    >
      <SelectTrigger render={trigger} />
    </Select>
  )
}
