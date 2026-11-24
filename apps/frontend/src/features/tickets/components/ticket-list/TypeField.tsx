import type { TicketId, TypeDefinition, TypeKey } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { Settings2 } from "@pp/ui/icons"
import { TextSwap } from "@pp/ui/text-swap"
import type { ComponentProps, ReactElement, ReactNode } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { typeMenuItems } from "@/features/tickets/components/ticket-list/typeMenuItems"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import { useTypeEditing } from "@/features/tickets/hooks/useTypeEditing"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import {
  resolveType,
  typeKeyOfOption,
  typeName,
  typeOptionValue
} from "@/features/tickets/lib/ticketTypes"
import { m } from "@/paraglide/messages"

type MenuContentProps = ComponentProps<typeof DropdownMenuContent>

export type TypeMenuAction = Readonly<{
  label: string
  onAction: () => void
}>

export function TypeMenuActionItem({
  action
}: Readonly<{ action: TypeMenuAction | null }>) {
  if (action === null) return null
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem label={action.label} onClick={action.onAction}>
        <Settings2 strokeWidth={1.75} />
        <span className="truncate">{action.label}</span>
      </DropdownMenuItem>
    </>
  )
}

function TypePicker({
  types,
  value,
  onChange,
  action = null,
  align,
  finalFocus,
  trigger,
  children
}: Readonly<{
  types: ReadonlyArray<TypeDefinition>
  value: TypeKey | null
  action?: TypeMenuAction | null
  onChange: (type: TypeKey | null) => void
  align: MenuContentProps["align"]
  finalFocus?: MenuContentProps["finalFocus"]
  trigger: ReactElement
  children: ReactNode
}>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger}>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        finalFocus={finalFocus}
        className={action === null ? "w-44" : "w-auto max-w-80"}
      >
        <DropdownMenuRadioGroup
          items={typeMenuItems(types)}
          value={typeOptionValue(value)}
          onValueChange={(next) => {
            const key = typeKeyOfOption(next)
            if (key !== value) onChange(key)
          }}
        />
        <TypeMenuActionItem action={action} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TypeSelect({
  orgSlug,
  slug,
  value,
  onChange,
  ariaLabel,
  className
}: Readonly<{
  orgSlug: string
  slug: string
  value: TypeKey | null
  onChange: (type: TypeKey | null) => void
  ariaLabel?: string
  className?: string
}>) {
  const types = useTicketTypes(orgSlug, slug)
  const type = resolveType(types, value)
  const label = typeName(type)
  return (
    <TypePicker
      types={types}
      value={value}
      onChange={onChange}
      align="end"
      finalFocus={false}
      trigger={
        <Button
          type="button"
          variant="ghost"
          tone="strong"
          onClick={(e) => e.stopPropagation()}
          aria-label={ariaLabel ?? m.tickets_type_aria_label({ label })}
          className={className}
        />
      }
    >
      <TextSwap
        className="gap-1.5"
        icon={<TypeGlyph type={type} className="size-3.5" />}
      >
        {label}
      </TextSwap>
    </TypePicker>
  )
}

export function TypeBadgeTrigger({
  ticket,
  onPatch,
  className
}: Readonly<{
  ticket: Readonly<{ id: TicketId; type: TypeKey | null }>
  onPatch: (patch: TicketEdit) => void
  className?: string
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const types = useTicketTypes(orgSlug, slug)
  const editing = useTypeEditing(orgSlug, slug)
  const type = resolveType(types, ticket.type)
  const label = typeName(type)
  const editable = type !== null && type.known && !type.hidden
  return (
    <TypePicker
      types={types}
      value={ticket.type}
      onChange={(next) => onPatch({ type: next })}
      action={
        editing.canEdit && editable
          ? {
              label: m.tickets_type_edit_starting({ type: type.name }),
              onAction: () => editing.openType(type.key)
            }
          : null
      }
      align="start"
      finalFocus={false}
      trigger={
        <Button
          type="button"
          variant="ghost"
          tone="strong"
          onClick={(e) => e.stopPropagation()}
          aria-label={m.tickets_type_aria_label({ label })}
          className={className}
        />
      }
    >
      <TextSwap
        className="gap-1.5"
        icon={<TypeGlyph type={type} className="size-3" />}
      >
        {label}
      </TextSwap>
    </TypePicker>
  )
}
