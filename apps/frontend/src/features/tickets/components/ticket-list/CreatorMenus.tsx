import type { Group, TypeKey } from "@pp/shared"
import { Plus } from "lucide-react"
import { useRef, type ComponentProps, type RefObject } from "react"

import { Select, SelectTrigger } from "@/components/ui/select"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { SprintAssignMenu } from "@/features/sprints/components/SprintAssignMenu"
import { SprintStateIcon } from "@/features/sprints/components/SprintChip"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import {
  resolveType,
  typeKeyOfOption,
  typeName,
  typeOptionValue
} from "@/features/tickets/lib/ticketTypes"
import { m } from "@/paraglide/messages"

import { CreatorChip } from "./CreatorChip"
import { typeMenuItems } from "./TypeField"

type OnOpenChange = NonNullable<ComponentProps<typeof Select>["onOpenChange"]>
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
  epics,
  onTypeChange,
  expanded,
  inputRef
}: CreatorMenuProps &
  Readonly<{
    type: TypeKey | null
    epics: boolean
    onTypeChange: (type: TypeKey | null) => void
  }>) {
  const { orgSlug, slug } = useProjectRoute()
  const types = useTicketTypes(orgSlug, slug)
  const shown = resolveType(types, type)
  const label = typeName(shown)
  const focus = useCreatorMenuFocus(inputRef)
  return (
    <Select
      items={typeMenuItems(types, epics)}
      value={typeOptionValue(type)}
      onValueChange={(next) => onTypeChange(typeKeyOfOption(next))}
      onOpenChange={focus.onOpenChange}
      contentProps={{
        align: "start",
        className: "w-44",
        finalFocus: focus.finalFocus
      }}
    >
      <SelectTrigger
        render={
          <CreatorChip
            expanded={expanded}
            tone="muted"
            tint={shown?.color}
            icon={<TypeGlyph type={shown} />}
            label={label}
            contentKey={typeOptionValue(type)}
            aria-label={m.tickets_create_type_aria_label({ type: label })}
          />
        }
      />
    </Select>
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
