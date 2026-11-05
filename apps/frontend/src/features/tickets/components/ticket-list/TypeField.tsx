import { TicketType, type TicketId, type UpdateTicketInput } from "@pp/shared"
import type { ComponentProps, ReactElement, ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Select, SelectTrigger } from "@/components/ui/select"
import { TYPE_LABELS, TYPE_META } from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type SelectContentProps = NonNullable<
  ComponentProps<typeof Select>["contentProps"]
>

export const typeOptions = (types: ReadonlyArray<TicketType>) =>
  types.map((t, index) => {
    const TIcon = TYPE_META[t].icon
    return {
      value: t,
      textValue: TYPE_LABELS[t](),
      separated: types[index + 1] === "epic",
      label: (
        <>
          <TIcon className="size-4" strokeWidth={1.75} />
          {TYPE_LABELS[t]()}
        </>
      )
    }
  })

function TypePicker({
  value,
  onChange,
  align,
  finalFocus,
  trigger,
  children
}: Readonly<{
  value: TicketType
  onChange: (type: TicketType) => void
  align: SelectContentProps["align"]
  finalFocus?: SelectContentProps["finalFocus"]
  trigger: ReactElement
  children: ReactNode
}>) {
  return (
    <Select
      items={typeOptions(TicketType.literals)}
      value={value}
      onValueChange={(next) => {
        if (next !== value) onChange(next)
      }}
      contentProps={{ align, className: "w-40", finalFocus }}
    >
      <SelectTrigger render={trigger}>{children}</SelectTrigger>
    </Select>
  )
}

export function TypeSelect({
  value,
  onChange,
  ariaLabel,
  className
}: {
  value: TicketType
  onChange: (type: TicketType) => void
  ariaLabel?: string
  className?: string
}) {
  const Icon = TYPE_META[value].icon
  const typeLabel = TYPE_LABELS[value]()
  return (
    <TypePicker
      value={value}
      onChange={onChange}
      align="end"
      finalFocus={false}
      trigger={
        <Button
          type="button"
          variant="chip"
          onClick={(e) => e.stopPropagation()}
          aria-label={
            ariaLabel ?? m.tickets_type_aria_label({ label: typeLabel })
          }
          className={className}
        />
      }
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
      <span>{typeLabel}</span>
    </TypePicker>
  )
}

export function TypeBadgeTrigger({
  ticket,
  onPatch,
  className
}: {
  ticket: { id: TicketId; type: TicketType }
  onPatch: (patch: UpdateTicketInput) => void
  className?: string
}) {
  const Icon = TYPE_META[ticket.type].icon
  const typeLabel = TYPE_LABELS[ticket.type]()
  return (
    <TypePicker
      value={ticket.type}
      onChange={(next) => onPatch({ type: next })}
      align="end"
      finalFocus={false}
      trigger={
        <Button
          type="button"
          variant="chip"
          onClick={(e) => e.stopPropagation()}
          aria-label={m.tickets_type_aria_label({ label: typeLabel })}
          className={className}
        />
      }
    >
      <Icon className="size-3.5" strokeWidth={1.75} />
      <span>{typeLabel}</span>
    </TypePicker>
  )
}

export function TypeButton({
  ticket,
  className,
  iconOnly,
  onPatch
}: {
  ticket: { id: TicketId; type: TicketType }
  className?: string
  iconOnly?: boolean
  onPatch: (patch: UpdateTicketInput) => void
}) {
  const Icon = TYPE_META[ticket.type].icon
  const typeLabel = TYPE_LABELS[ticket.type]()
  return (
    <TypePicker
      value={ticket.type}
      onChange={(next) => onPatch({ type: next })}
      align="start"
      trigger={
        <Button
          type="button"
          variant="chip"
          size={iconOnly ? "icon-sm" : undefined}
          onClick={(e) => e.stopPropagation()}
          aria-label={m.tickets_type_aria_label({ label: typeLabel })}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            className
          )}
        />
      }
    >
      {iconOnly ? (
        <Icon strokeWidth={1.75} />
      ) : (
        <>
          <Icon className="size-3.5" strokeWidth={1.75} />
          {typeLabel}
        </>
      )}
    </TypePicker>
  )
}
