import type { TicketPriority } from "@pp/shared"
import type { ReactNode } from "react"

import { CommandMenuItem, CommandMenuCheck } from "@/components/ui/command-menu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import {
  PRIORITY_LABELS,
  PRIORITY_META,
  PRIORITY_ORDER
} from "@/features/tickets/lib/priorityMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useTicketMutation } from "./useTicketMutation"

export function TicketPriorityCommands({
  ticket,
  chip,
  onBack,
  onClose
}: Readonly<{
  ticket: TicketContext
  chip: ReactNode
  onBack: () => void
  onClose: () => void
}>) {
  const { current, update } = useTicketMutation(ticket)
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
      renderItem={(item) => {
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
            {current?.priority === priority && <CommandMenuCheck />}
          </CommandMenuItem>
        )
      }}
    />
  )
}
