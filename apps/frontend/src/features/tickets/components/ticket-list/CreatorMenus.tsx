import type { Group, TypeKey } from "@pp/shared"
import { Plus } from "lucide-react"
import { useRef, type ComponentProps, type RefObject } from "react"

import { Button } from "@/components/ui/button"
import { Select, SelectTrigger } from "@/components/ui/select"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { SprintAssignMenu } from "@/features/sprints/components/SprintAssignMenu"
import { SprintStateIcon } from "@/features/sprints/components/SprintChip"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import { useTypeEditing } from "@/features/tickets/hooks/useTypeEditing"
import {
  resolveType,
  typeKeyOfOption,
  typeName,
  typeOptionValue
} from "@/features/tickets/lib/ticketTypes"
import { m } from "@/paraglide/messages"

import { CreatorChip } from "./CreatorChip"
import { typeActionItems, typeMenuItems } from "./TypeField"

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

export function useCreatorTypeItems(
  orgSlug: string,
  slug: string,
  epics: boolean,
  lastUsed: TypeKey | null
) {
  const types = useTicketTypes(orgSlug, slug)
  const editing = useTypeEditing(orgSlug, slug)
  return {
    types,
    items: [
      ...typeMenuItems(types, {
        epics,
        lastUsed,
        separateNone: editing.canEdit
      }),
      ...typeActionItems(
        editing.canEdit
          ? {
              label: m.tickets_create_type_edit_types(),
              onAction: editing.openTypes
            }
          : null
      )
    ]
  }
}

export function CreatorTypeMenu({
  type,
  lastUsed,
  epics,
  onTypeChange,
  expanded,
  inputRef
}: CreatorMenuProps &
  Readonly<{
    type: TypeKey | null
    lastUsed: TypeKey | null
    epics: boolean
    onTypeChange: (type: TypeKey | null) => void
  }>) {
  const { orgSlug, slug } = useProjectRoute()
  const { types, items } = useCreatorTypeItems(orgSlug, slug, epics, lastUsed)
  const shown = resolveType(types, type)
  const label = typeName(shown)
  const focus = useCreatorMenuFocus(inputRef)
  return (
    <Select
      items={items}
      value={typeOptionValue(type)}
      onValueChange={(next) => onTypeChange(typeKeyOfOption(next))}
      onOpenChange={focus.onOpenChange}
      contentProps={{
        align: "start",
        className: "w-56",
        finalFocus: focus.finalFocus
      }}
    >
      <SelectTrigger
        render={
          <CreatorChip
            expanded={expanded}
            tone="muted"
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

export function CreatorTypeSelect({
  orgSlug,
  slug,
  type,
  lastUsed,
  epics,
  onTypeChange
}: Readonly<{
  orgSlug: string
  slug: string
  type: TypeKey | null
  lastUsed: TypeKey | null
  epics: boolean
  onTypeChange: (type: TypeKey | null) => void
}>) {
  const { types, items } = useCreatorTypeItems(orgSlug, slug, epics, lastUsed)
  const shown = resolveType(types, type)
  const label = typeName(shown)
  return (
    <Select
      items={items}
      value={typeOptionValue(type)}
      onValueChange={(next) => onTypeChange(typeKeyOfOption(next))}
      contentProps={{ align: "start", className: "w-56" }}
    >
      <SelectTrigger
        render={
          <Button
            type="button"
            variant="chip"
            aria-label={m.tickets_type_aria_label({ label })}
          />
        }
      >
        <TypeGlyph type={shown} className="size-3.5" />
        <span>{label}</span>
      </SelectTrigger>
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
