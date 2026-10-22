import type { TicketId, TicketType, UpdateTicketInput } from "@pp/shared"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { TYPE_LABELS, TYPE_META } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

function TypeMenuItems({
  current,
  onSelect
}: Readonly<{
  current: TicketType
  onSelect: (type: TicketType) => void
}>) {
  return (
    <DropdownMenuRadioGroup
      value={current}
      onValueChange={(next: string) => {
        if (next !== current) onSelect(next as TicketType)
      }}
    >
      {(Object.keys(TYPE_META) as TicketType[]).map((t) => {
        const TIcon = TYPE_META[t].icon
        return (
          <DropdownMenuRadioItem key={t} value={t} closeOnClick>
            <TIcon className="size-4" strokeWidth={1.75} />
            {TYPE_LABELS[t]()}
          </DropdownMenuRadioItem>
        )
      })}
    </DropdownMenuRadioGroup>
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
  const meta = TYPE_META[value]
  const Icon = meta.icon
  const typeLabel = TYPE_LABELS[value]()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="chip"
            onClick={(e) => e.stopPropagation()}
            aria-label={
              ariaLabel ?? m.tickets_type_aria_label({ label: typeLabel })
            }
            className={className}
          >
            <Icon className="size-3.5" strokeWidth={1.75} />
            <span>{typeLabel}</span>
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-40"
        finalFocus={false}
        onClick={(e) => e.stopPropagation()}
      >
        <TypeMenuItems current={value} onSelect={onChange} />
      </DropdownMenuContent>
    </DropdownMenu>
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
  const meta = TYPE_META[ticket.type]
  const Icon = meta.icon
  const typeLabel = TYPE_LABELS[ticket.type]()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="chip"
            onClick={(e) => e.stopPropagation()}
            aria-label={m.tickets_type_aria_label({ label: typeLabel })}
            className={className}
          >
            <Icon className="size-3.5" strokeWidth={1.75} />
            <span>{typeLabel}</span>
          </Button>
        }
      />
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="w-40"
        finalFocus={false}
        onClick={(e) => e.stopPropagation()}
      >
        <TypeMenuItems
          current={ticket.type}
          onSelect={(next) => onPatch({ type: next })}
        />
      </DropdownMenuContent>
    </DropdownMenu>
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
  const meta = TYPE_META[ticket.type]
  const Icon = meta.icon
  const typeLabel = TYPE_LABELS[ticket.type]()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          iconOnly ? (
            <Button
              type="button"
              variant="chip"
              size="icon-sm"
              onClick={(e) => e.stopPropagation()}
              aria-label={m.tickets_type_aria_label({ label: typeLabel })}
              className={cn(
                "text-muted-foreground hover:text-foreground",
                className
              )}
            >
              <Icon strokeWidth={1.75} />
            </Button>
          ) : (
            <Button
              type="button"
              variant="chip"
              onClick={(e) => e.stopPropagation()}
              aria-label={m.tickets_type_aria_label({ label: typeLabel })}
              className={cn(
                "text-muted-foreground hover:text-foreground",
                className
              )}
            >
              <Icon className="size-3.5" strokeWidth={1.75} />
              {typeLabel}
            </Button>
          )
        }
      />
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-40"
        onClick={(e) => e.stopPropagation()}
      >
        <TypeMenuItems
          current={ticket.type}
          onSelect={(next) => onPatch({ type: next })}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
