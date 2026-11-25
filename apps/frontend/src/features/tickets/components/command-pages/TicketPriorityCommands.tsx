import type { TicketPriority } from "@pp/shared"
import {
  CommandMenuCheck,
  CommandMenuItem,
  CommandMenuShortcut
} from "@pp/ui/command-menu"
import { cn } from "@pp/ui/lib/utils"
import { useState, type ReactNode } from "react"

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
import { stagedCount } from "@/features/tickets/lib/stagedChanges"
import { keyLabels } from "@/lib/keyLabels"
import { m } from "@/paraglide/messages"

import { groupBy } from "../ticket-list/selectionUndo"
import {
  StagedChanges,
  StagedMove,
  StagedRowCount,
  StagedValue
} from "./StagedChanges"
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
  // Several tickets: a pick is staged, and Apply (or picking it again)
  // sends it.
  const many = selection.length > 1
  const [staged, setStaged] = useState<TicketPriority | null>(null)
  const groups = groupBy(selection, (each) => each.priority)
  const counts = new Map<string, number>(
    groups.map(([priority, ids]) => [priority, ids.length])
  )
  const apply = (priority: TicketPriority) => {
    update({ priority })
    onClose()
  }
  const lines =
    staged === null
      ? []
      : groups
          .filter(([priority]) => priority !== staged)
          .map(([priority, ids]) => ({
            key: priority,
            count: ids.length,
            change: (
              <StagedMove
                from={<PriorityValue priority={priority} />}
                to={<PriorityValue priority={staged} />}
              />
            )
          }))
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
        if (priority === undefined) {
          onClose()
          return
        }
        if (!many || staged === priority) apply(priority)
        else setStaged(priority)
      }}
      onSubmit={
        many && staged !== null && lines.length > 0
          ? () => apply(staged)
          : undefined
      }
      footer={
        many ? (
          <StagedChanges
            hint={m.tickets_selection_choose()}
            applyLabel={m.tickets_selection_apply({
              count: stagedCount(lines, selection.length)
            })}
            onApply={() => {
              if (staged !== null) apply(staged)
            }}
            lines={lines}
          />
        ) : undefined
      }
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
            {many && <StagedRowCount count={counts.get(item.value)} />}
            {number !== undefined && (
              <CommandMenuShortcut
                keys={number}
                keyLabels={keyLabels()}
                aria-hidden
              />
            )}
            <CommandMenuCheck
              checked={(staged ?? current?.priority) === priority}
              label={m.chrome_command_menu_selected()}
            />
          </CommandMenuItem>
        )
      }}
    />
  )
}

function PriorityValue({ priority }: Readonly<{ priority: TicketPriority }>) {
  const meta = PRIORITY_META[priority]
  return (
    <StagedValue
      label={PRIORITY_LABELS[priority]()}
      icon={<meta.icon className={meta.className} strokeWidth={1.75} />}
    />
  )
}
