import type { TicketPriority } from "@pp/shared"
import {
  CommandMenuCheck,
  CommandMenuItem,
  CommandMenuShortcut
} from "@pp/ui/command-menu"
import { cn } from "@pp/ui/lib/utils"
import type { ReactNode } from "react"

import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type {
  SelectedTicket,
  TicketContext
} from "@/features/command-menu/lib/commandMenu"
import {
  PRIORITY_LABELS,
  PRIORITY_META,
  PRIORITY_ORDER
} from "@/features/tickets/lib/priorityMeta"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

import { useTicketMutation } from "./useTicketMutation"

export function TicketPriorityCommands({
  ticket,
  selection,
  chip,
  onBack,
  onClose
}: Readonly<{
  ticket: TicketContext
  selection: ReadonlyArray<SelectedTicket>
  chip: ReactNode
  onBack: () => void
  onClose: () => void
}>) {
  const { current, update } = useTicketMutation(ticket, selection)
  const byValue = new Map<string, TicketPriority>(
    PRIORITY_ORDER.map((priority) => [priority, priority])
  )
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_priority_placeholder()}
      onBack={onBack}
      items={PRIORITY_ORDER.map((priority) => ({
        value: priority,
        label: PRIORITY_LABELS[priority]()
      }))}
      onSelect={(item) => {
        const priority = byValue.get(item.value)
        if (priority) update({ priority })
        onClose()
      }}
      numbered
      renderItem={(item, number) => {
        const priority = byValue.get(item.value)
        if (priority === undefined) return null
        const meta = PRIORITY_META[priority]
        const Icon = meta.icon
        return (
          <CommandMenuItem value={item.value}>
            <Icon
              className={cn("size-4 shrink-0", meta.className)}
              strokeWidth={1.75}
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {number !== undefined && (
              <CommandMenuShortcut
                keys={number}
                keyLabels={keyLabels()}
                aria-hidden
              />
            )}
            <CommandMenuCheck
              checked={current?.priority === priority}
              label={m.chrome_command_menu_selected()}
            />
          </CommandMenuItem>
        )
      }}
    />
  )
}
