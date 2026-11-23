import {
  pickActiveSprint,
  pickEarliestPlannedSprint,
  sprintState,
  type Group
} from "@pp/shared"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { CircleDashed, Plus } from "@pp/ui/icons"
import { KbdShortcut } from "@pp/ui/kbd"
import { menuItemDetailClass } from "@pp/ui/menu-styles"
import { ShortcutTooltip } from "@pp/ui/tooltip"
import * as DateTime from "effect/DateTime"
import { useState, type ComponentProps, type ReactElement } from "react"

import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

import { SprintStateIcon, sprintStateLabel } from "./SprintChip"

type MenuProps = ComponentProps<typeof DropdownMenu>
type ContentProps = ComponentProps<typeof DropdownMenuContent>

const NO_SPRINT = "__no-sprint"

function rangeText(s: Group) {
  if (!s.startsAt || !s.endsAt) return ""
  const fmt = new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric"
  })
  return `${fmt.format(s.startsAt)} – ${fmt.format(s.endsAt)}`
}

function sprintDetail(s: Group) {
  const range = rangeText(s)
  const state = sprintStateLabel(sprintState(s))
  return range === "" ? state : m.tickets_sprint_option_detail({ range, state })
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
  onOpenChange?: MenuProps["onOpenChange"]
  finalFocus?: ContentProps["finalFocus"]
  tooltip?: string
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
  finalFocus,
  tooltip
}: SprintAssignMenuProps) {
  const [query, setQuery] = useState("")
  const eligible = eligibleSprints(sprints)
  const noneText = m.tickets_sprint_none()
  const none = {
    value: NO_SPRINT,
    textValue: noneText,
    closeOnClick: true,
    label: (
      <>
        <CircleDashed strokeWidth={1.75} />
        <span className="truncate">{noneText}</span>
      </>
    )
  }
  const items = [
    none,
    ...eligible.map((s) => ({
      value: s.id,
      textValue: s.name,
      closeOnClick: true,
      label: (
        <>
          <SprintStateIcon sprint={s} size="md" />
          <span className="min-w-0 truncate">{s.name}</span>
          <span data-menu-meta className={menuItemDetailClass}>
            {sprintDetail(s)}
          </span>
        </>
      )
    }))
  ]
  return (
    <DropdownMenu
      open={open}
      onOpenChange={onOpenChange}
      filterable={{ value: query, onValueChange: setQuery }}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) setQuery("")
      }}
    >
      {tooltip === undefined ? (
        <DropdownMenuTrigger render={trigger} />
      ) : (
        <ShortcutTooltip
          hotkey={appHotkeys["tickets.sprint"]}
          label={tooltip}
          keyLabels={keyLabels()}
        >
          <DropdownMenuTrigger render={trigger} />
        </ShortcutTooltip>
      )}
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        finalFocus={finalFocus ?? false}
        className="w-max max-w-[min(20rem,calc(100vw-2rem))] min-w-60"
      >
        <DropdownMenuInput
          placeholder={m.tickets_sprint_search_placeholder()}
          aria-label={m.tickets_sprint_search_placeholder()}
          shortcut={
            <KbdShortcut
              keys={appHotkeys["tickets.sprint"].defaultHotkey}
              keyLabels={keyLabels()}
              aria-hidden
            />
          }
        />
        <DropdownMenuList className="max-h-80">
          <DropdownMenuRadioGroup
            value={selectedId === undefined ? null : (selectedId ?? NO_SPRINT)}
            onValueChange={(id) => {
              if (id === NO_SPRINT) {
                if (selectedId !== null) onSelect(null)
                return
              }
              const next = eligible.find((s) => s.id === id)
              if (next && id !== selectedId) onSelect(next)
            }}
            items={items}
          />
          {onRequestNewSprint !== undefined && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onRequestNewSprint}>
                <Plus strokeWidth={1.75} />
                {m.tickets_sprint_popover_new_sprint_action()}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuList>
        <DropdownMenuEmpty>{m.tickets_sprint_no_match()}</DropdownMenuEmpty>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
