import type { TicketId, TypeDefinition, TypeKey } from "@pp/shared"
import type { ComponentProps, ReactElement, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Select, SelectTrigger } from "@/components/ui/select"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
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

export const typeMenuItems = (
  types: ReadonlyArray<TypeDefinition>,
  epics: boolean = true
) =>
  typeOptions(types, epics).map((option) => ({
    value: option.value,
    textValue: typeName(option.type),
    separated: option.separated,
    label: (
      <>
        <TypeGlyph type={option.type} />
        <span className="truncate">{typeName(option.type)}</span>
      </>
    )
  }))

function TypePicker({
  types,
  value,
  onChange,
  align,
  finalFocus,
  trigger,
  children
}: Readonly<{
  types: ReadonlyArray<TypeDefinition>
  value: TypeKey | null
  onChange: (type: TypeKey | null) => void
  align: SelectContentProps["align"]
  finalFocus?: SelectContentProps["finalFocus"]
  trigger: ReactElement
  children: ReactNode
}>) {
  return (
    <Select
      items={typeMenuItems(types)}
      value={typeOptionValue(value)}
      onValueChange={(next) => {
        const key = typeKeyOfOption(next)
        if (key !== value) onChange(key)
      }}
      contentProps={{ align, className: "w-44", finalFocus }}
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
  const type = resolveType(types, ticket.type)
  const label = typeName(type)
  return (
    <TypePicker
      types={types}
      value={ticket.type}
      onChange={(next) => onPatch({ type: next })}
      align="end"
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
