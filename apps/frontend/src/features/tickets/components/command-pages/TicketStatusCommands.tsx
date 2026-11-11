import { useAtomValue } from "@effect/atom-react"
import type { ProjectStatus } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import type { ReactNode } from "react"

import { CommandMenuItem, CommandMenuCheck } from "@/components/ui/command-menu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useTicketMutation } from "./useTicketMutation"

const NO_STATUSES: ReadonlyArray<ProjectStatus> = []

export function TicketStatusCommands({
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
  const result = useAtomValue(
    statusesFor(statusesRequest(ticket.orgSlug, ticket.slug))
  )
  const statuses = Result.isSuccess(result) ? result.value : NO_STATUSES
  const { current, update } = useTicketMutation(ticket)
  const bySlug = new Map<string, ProjectStatus>(
    statuses.map((status) => [status.slug, status])
  )

  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_status_placeholder()}
      onBack={onBack}
      items={statuses.map((status) => ({
        value: status.slug,
        label: statusMetaFor(status.slug, statuses).label
      }))}
      onSelect={(item) => {
        const status = bySlug.get(item.value)
        if (status) update({ status: status.slug })
        onClose()
      }}
      renderItem={(item) => {
        const status = bySlug.get(item.value)
        if (status === undefined) return null
        const meta = statusMetaFor(status.slug, statuses)
        const Icon = meta.icon
        return (
          <CommandMenuItem value={item.value}>
            <Icon
              className={cn("size-4 shrink-0", meta.className)}
              style={meta.color ? { color: meta.color } : undefined}
              strokeWidth={1.75}
            />
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {current?.status === item.value && <CommandMenuCheck />}
          </CommandMenuItem>
        )
      }}
    />
  )
}
