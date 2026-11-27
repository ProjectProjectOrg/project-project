import type { TicketId, TicketPriority } from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { cn } from "@pp/ui/lib/utils"
import { PickerFieldValue } from "@pp/ui/picker-field"
import { ShortcutTooltip } from "@pp/ui/tooltip"
import type { ComponentProps, MouseEvent, ReactElement } from "react"

import {
  PRIORITY_LABELS,
  PRIORITY_META,
  PRIORITY_ORDER
} from "@/features/tickets/lib/priorityMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { appHotkeys } from "@/lib/appHotkeys"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

const priorityOptions = () =>
  PRIORITY_ORDER.map((p) => {
    const pMeta = PRIORITY_META[p]
    const PIcon = pMeta.icon
    return {
      value: p,
      textValue: PRIORITY_LABELS[p](),
      closeOnClick: true,
      label: (
        <>
          <PIcon className={cn("size-4", pMeta.className)} strokeWidth={1.75} />
          {PRIORITY_LABELS[p]()}
        </>
      )
    }
  })

export function PriorityMenu({
  value,
  onChange,
  trigger,
  label,
  disabled = false,
  className = "w-44"
}: Readonly<{
  value: TicketPriority | null
  onChange: (priority: TicketPriority) => void
  trigger: ReactElement
  label?: string
  disabled?: boolean
  className?: string
}>) {
  return (
    <DropdownMenu disabled={disabled}>
      <ShortcutTooltip
        hotkey={appHotkeys["tickets.priority"]}
        label={label}
        keyLabels={keyLabels()}
      >
        <DropdownMenuTrigger render={trigger} />
      </ShortcutTooltip>
      <PriorityMenuContent
        value={value}
        onChange={onChange}
        className={className}
      />
    </DropdownMenu>
  )
}

export function PriorityMenuContent({
  value,
  onChange,
  className = "w-44",
  anchor,
  finalFocus = false
}: Pick<
  ComponentProps<typeof PriorityMenu>,
  "value" | "onChange" | "className"
> &
  Pick<ComponentProps<typeof DropdownMenuContent>, "anchor" | "finalFocus">) {
  return (
    <DropdownMenuContent
      anchor={anchor}
      align="start"
      sideOffset={6}
      className={className}
      finalFocus={finalFocus}
    >
      <PriorityOptions value={value} onChange={onChange} />
    </DropdownMenuContent>
  )
}

function PriorityOptions({
  value,
  onChange
}: Pick<ComponentProps<typeof PriorityMenu>, "value" | "onChange">) {
  return (
    <DropdownMenuRadioGroup
      value={value}
      onValueChange={(next) => {
        if (next !== value) onChange(next)
      }}
      items={priorityOptions()}
    />
  )
}

export function PrioritySelect({
  value,
  selected = value,
  onChange,
  stopPropagation,
  showLabel = false
}: {
  value: TicketPriority
  selected?: TicketPriority | null
  onChange: (priority: TicketPriority) => void
  stopPropagation?: boolean
  showLabel?: boolean
}) {
  const meta = PRIORITY_META[value]
  const Icon = meta.icon
  const priorityLabel = PRIORITY_LABELS[value]()
  const icon = (
    <Icon className={cn("size-3.5", meta.className)} strokeWidth={1.75} />
  )
  const triggerProps = {
    onClick: (event: MouseEvent) => stopPropagation && event.stopPropagation(),
    "aria-label": m.tickets_priority_aria_label({ label: priorityLabel })
  }
  return (
    <PriorityMenu
      value={selected}
      onChange={onChange}
      label={priorityLabel}
      trigger={
        showLabel ? (
          <PickerFieldValue
            label={priorityLabel}
            icon={icon}
            {...triggerProps}
          />
        ) : (
          <Button
            type="button"
            variant="ghost"
            tone="strong"
            size="square-6"
            {...triggerProps}
          >
            {icon}
          </Button>
        )
      }
    />
  )
}

export function PriorityBadgeTrigger({
  ticket,
  onPatch,
  className
}: {
  ticket: { id: TicketId; priority: TicketPriority }
  onPatch: (patch: TicketEdit) => void
  className?: string
}) {
  const meta = PRIORITY_META[ticket.priority]
  const Icon = meta.icon
  const priorityLabel = PRIORITY_LABELS[ticket.priority]()
  return (
    <PriorityMenu
      value={ticket.priority}
      onChange={(priority) => onPatch({ priority })}
      className="w-40"
      trigger={
        <PickerFieldValue
          label={priorityLabel}
          icon={
            <Icon
              className={cn("size-3.5", meta.className)}
              strokeWidth={1.75}
            />
          }
          onClick={(e) => e.stopPropagation()}
          aria-label={m.tickets_priority_aria_label({ label: priorityLabel })}
          className={className}
        />
      }
    />
  )
}
