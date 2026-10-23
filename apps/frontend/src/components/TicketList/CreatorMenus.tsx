import { TicketType, type Group } from "@pp/shared"
import { Plus } from "lucide-react"
import { useRef, type ComponentProps, type RefObject } from "react"

import { SprintAssignMenu } from "@/components/sprints/SprintAssignMenu"
import { SprintStateIcon } from "@/components/sprints/SprintChip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { TYPE_LABELS, TYPE_META } from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"

import { CreatorChip } from "./CreatorChip"

type OnOpenChange = NonNullable<
  ComponentProps<typeof DropdownMenu>["onOpenChange"]
>
type CloseReason = Parameters<OnOpenChange>[1]["reason"]

type CreatorMenuProps = Readonly<{
  expanded: boolean
  inputRef: RefObject<HTMLInputElement | null>
}>

function useCreatorMenuFocus(inputRef: RefObject<HTMLInputElement | null>) {
  const closeReason = useRef<CloseReason | null>(null)
  const handleOpenChange: OnOpenChange = (open, details) => {
    closeReason.current = open ? null : details.reason
  }
  const finalFocus = () => {
    switch (closeReason.current) {
      case "item-press":
        return inputRef.current
      case "outside-press":
      case "focus-out":
        return false
      default:
        return true
    }
  }
  return { onOpenChange: handleOpenChange, finalFocus }
}

export function CreatorTypeMenu({
  type,
  onTypeChange,
  expanded,
  inputRef
}: CreatorMenuProps &
  Readonly<{
    type: TicketType
    onTypeChange: (type: TicketType) => void
  }>) {
  const TypeIcon = TYPE_META[type].icon
  const focus = useCreatorMenuFocus(inputRef)
  return (
    <DropdownMenu onOpenChange={focus.onOpenChange}>
      <DropdownMenuTrigger
        render={
          <CreatorChip
            expanded={expanded}
            tone={TYPE_META[type].tone}
            icon={<TypeIcon className="size-4 shrink-0" strokeWidth={1.75} />}
            label={TYPE_LABELS[type]()}
            contentKey={type}
            aria-label={m.tickets_create_type_aria_label({
              type: TYPE_LABELS[type]()
            })}
          />
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-40"
        finalFocus={focus.finalFocus}
      >
        <DropdownMenuRadioGroup
          value={type}
          onValueChange={onTypeChange}
          items={TicketType.literals.map((t) => {
            const TIcon = TYPE_META[t].icon
            return {
              value: t,
              closeOnClick: true,
              label: (
                <>
                  <TIcon className="size-4" strokeWidth={1.75} />
                  {TYPE_LABELS[t]()}
                </>
              )
            }
          })}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function CreatorSprintMenu({
  sprints,
  selected,
  onSelectedChange,
  expanded,
  inputRef
}: CreatorMenuProps &
  Readonly<{
    sprints: ReadonlyArray<Group>
    selected: Group | null
    onSelectedChange: (sprint: Group | null) => void
  }>) {
  const focus = useCreatorMenuFocus(inputRef)
  return (
    <SprintAssignMenu
      onOpenChange={focus.onOpenChange}
      finalFocus={focus.finalFocus}
      sprints={sprints}
      selectedId={selected?.id ?? null}
      onSelect={onSelectedChange}
      onClear={() => onSelectedChange(null)}
      clearLabel={m.tickets_sprint_popover_no_assignment_action()}
      trigger={
        <CreatorChip
          expanded={expanded}
          tone="muted"
          icon={
            selected ? (
              <SprintStateIcon sprint={selected} size="md" />
            ) : (
              <Plus className="size-4 shrink-0" strokeWidth={1.75} />
            )
          }
          label={selected ? selected.name : m.tickets_assign_sprint_chip()}
          labelClassName="max-w-[10ch]"
          contentKey={selected?.id ?? "none"}
          aria-label={
            selected
              ? m.tickets_sprint_chip_aria({ name: selected.name })
              : m.tickets_assign_sprint_chip()
          }
        />
      }
    />
  )
}
