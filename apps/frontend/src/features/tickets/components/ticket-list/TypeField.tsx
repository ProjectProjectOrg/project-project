import type { TicketId, TypeDefinition, TypeKey } from "@pp/shared"
import { Settings2 } from "lucide-react"
import type { ComponentProps, ReactElement, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Select, SelectTrigger } from "@/components/ui/select"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import { useTypeEditing } from "@/features/tickets/hooks/useTypeEditing"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import {
  resolveType,
  typeKeyOfOption,
  typeName,
  typeOptions,
  typeOptionValue
} from "@/features/tickets/lib/ticketTypes"
import { m } from "@/paraglide/messages"

type SelectContentProps = NonNullable<
  ComponentProps<typeof Select>["contentProps"]
>

export type TypeMenuAction = Readonly<{
  label: string
  onAction: () => void
}>

const TYPE_MENU_ACTION = "type-menu-action"

export const typeMenuItems = (
  types: ReadonlyArray<TypeDefinition>,
  {
    epics = true,
    lastUsed,
    separateNone = false
  }: Readonly<{
    epics?: boolean
    lastUsed?: TypeKey | null
    separateNone?: boolean
  }> = {}
) =>
  typeOptions(types, epics).map((option) => ({
    value: option.value,
    textValue: typeName(option.type),
    separated: option.separated || (separateNone && option.type === null),
    label: (
      <>
        <TypeGlyph type={option.type} />
        <span className="truncate">{typeName(option.type)}</span>
        {lastUsed !== undefined && (option.type?.key ?? null) === lastUsed && (
          <span className="ml-auto shrink-0 text-micro text-muted-foreground">
            {m.tickets_create_type_last_used()}
          </span>
        )}
      </>
    )
  }))

export const typeActionItems = (action: TypeMenuAction | null) =>
  action === null
    ? []
    : [
        {
          value: TYPE_MENU_ACTION,
          textValue: action.label,
          label: (
            <>
              <Settings2 strokeWidth={1.75} />
              <span className="truncate">{action.label}</span>
            </>
          ),
          onAction: action.onAction
        }
      ]

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
  align: SelectContentProps["align"]
  finalFocus?: SelectContentProps["finalFocus"]
  trigger: ReactElement
  children: ReactNode
}>) {
  return (
    <Select
      items={[
        ...typeMenuItems(types, { separateNone: action !== null }),
        ...typeActionItems(action)
      ]}
      value={typeOptionValue(value)}
      onValueChange={(next) => {
        const key = typeKeyOfOption(next)
        if (key !== value) onChange(key)
      }}
      contentProps={{
        align,
        className: action === null ? "w-44" : "w-auto max-w-80",
        finalFocus
      }}
    >
      <SelectTrigger render={trigger}>{children}</SelectTrigger>
    </Select>
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
          variant="chip"
          onClick={(e) => e.stopPropagation()}
          aria-label={ariaLabel ?? m.tickets_type_aria_label({ label })}
          className={className}
        />
      }
    >
      <TypeGlyph type={type} className="size-3.5" />
      <span>{label}</span>
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
          variant="chip"
          onClick={(e) => e.stopPropagation()}
          aria-label={m.tickets_type_aria_label({ label })}
          className={className}
        />
      }
    >
      <TypeGlyph type={type} className="size-3" />
      <span>{label}</span>
    </TypePicker>
  )
}
