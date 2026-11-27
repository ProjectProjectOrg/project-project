import { sprintState, type Group } from "@pp/shared"
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
import { useState, type ComponentProps, type ReactElement } from "react"

import { formatSprintRange } from "@/features/sprints/lib/sprintDates"
import { sprintStateLabel } from "@/features/sprints/lib/sprintPresentation"
import { eligibleSprints } from "@/features/sprints/lib/sprintTargets"
import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

import { SprintStateIcon } from "./SprintChip"

type MenuProps = ComponentProps<typeof DropdownMenu>
type ContentProps = ComponentProps<typeof DropdownMenuContent>

const NO_SPRINT = "__no-sprint"

function sprintDetail(s: Group) {
  const range =
    s.startsAt && s.endsAt ? formatSprintRange(s.startsAt, s.endsAt) : ""
  const state = sprintStateLabel(sprintState(s))
  return range === "" ? state : m.tickets_sprint_option_detail({ range, state })
}

export type SprintAssignMenuProps = {
  trigger?: ReactElement
  anchor?: ContentProps["anchor"]
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

export function SprintAssignMenu({
  trigger,
  sprints,
  selectedId,
  onSelect,
  onRequestNewSprint,
  open,
  onOpenChange,
  finalFocus,
  tooltip,
  anchor
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
      {trigger === undefined ? null : tooltip === undefined ? (
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
        anchor={anchor}
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
