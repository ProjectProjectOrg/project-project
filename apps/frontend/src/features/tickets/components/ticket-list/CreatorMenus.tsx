import type { Group, TypeKey } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { CircleDashed } from "@pp/ui/icons"
import { TextSwap } from "@pp/ui/text-swap"
import { useRef, type RefObject } from "react"

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
import { TypeMenuActionItem, typeMenuItems } from "./TypeField"

type CreatorMenuProps = Readonly<{
  expanded: boolean
  inputRef: RefObject<HTMLElement | null>
}>

function useCreatorMenuFocus(inputRef: RefObject<HTMLElement | null>) {
  const closeReason = useRef<string | null>(null)
  const handleOpenChange = (
    open: boolean,
    details: Readonly<{ reason: string }>
  ) => {
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

function CreatorTypeOptions({
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
  lastUsed: TypeKey | null | undefined
  epics: boolean
  onTypeChange: (type: TypeKey | null) => void
}>) {
  const types = useTicketTypes(orgSlug, slug)
  const editing = useTypeEditing(orgSlug, slug)
  return (
    <>
      <DropdownMenuRadioGroup
        items={typeMenuItems(types, { epics, lastUsed })}
        value={typeOptionValue(type)}
        onValueChange={(next) => onTypeChange(typeKeyOfOption(next))}
      />
      <TypeMenuActionItem
        action={
          editing.canEdit
            ? {
                label: m.tickets_create_type_edit_types(),
                onAction: editing.openTypes
              }
            : null
        }
      />
    </>
  )
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
    lastUsed: TypeKey | null | undefined
    epics: boolean
    onTypeChange: (type: TypeKey | null) => void
  }>) {
  const { orgSlug, slug } = useProjectRoute()
  const shown = resolveType(useTicketTypes(orgSlug, slug), type)
  const label = typeName(shown)
  const focus = useCreatorMenuFocus(inputRef)
  return (
    <DropdownMenu onOpenChange={focus.onOpenChange}>
      <DropdownMenuTrigger
        render={
          <CreatorChip
            expanded={expanded}
            tone="muted"
            icon={<TypeGlyph type={shown} />}
            label={label}
            aria-label={m.tickets_create_type_aria_label({ type: label })}
          />
        }
      />
      <DropdownMenuContent
        align="start"
        className="w-56"
        finalFocus={focus.finalFocus}
      >
        <CreatorTypeOptions
          orgSlug={orgSlug}
          slug={slug}
          type={type}
          lastUsed={lastUsed}
          epics={epics}
          onTypeChange={onTypeChange}
        />
      </DropdownMenuContent>
    </DropdownMenu>
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
  lastUsed: TypeKey | null | undefined
  epics: boolean
  onTypeChange: (type: TypeKey | null) => void
}>) {
  const shown = resolveType(useTicketTypes(orgSlug, slug), type)
  const label = typeName(shown)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            tone="strong"
            aria-label={m.tickets_type_aria_label({ label })}
          />
        }
      >
        <TextSwap
          className="gap-1.5"
          icon={<TypeGlyph type={shown} className="size-3.5" />}
        >
          {label}
        </TextSwap>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <CreatorTypeOptions
          orgSlug={orgSlug}
          slug={slug}
          type={type}
          lastUsed={lastUsed}
          epics={epics}
          onTypeChange={onTypeChange}
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
      trigger={
        <CreatorChip
          expanded={expanded}
          tone="muted"
          icon={
            selected ? (
              <SprintStateIcon sprint={selected} size="md" />
            ) : (
              <CircleDashed className="size-4 shrink-0" strokeWidth={1.75} />
            )
          }
          label={selected?.name ?? m.tickets_sprint_none()}
          labelClassName="max-w-[10ch]"
          aria-label={m.tickets_sprint_chip_aria({
            name: selected?.name ?? m.tickets_sprint_none()
          })}
        />
      }
    />
  )
}
