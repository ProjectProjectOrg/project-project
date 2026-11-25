import { useAtomValue } from "@effect/atom-react"
import type { ProjectStatus } from "@pp/shared"
import {
  CommandMenuCheck,
  CommandMenuItem,
  CommandMenuShortcut
} from "@pp/ui/command-menu"
import { cn } from "@pp/ui/lib/utils"
import * as Result from "effect/reactivity/AsyncResult"
import { useState, type ReactNode } from "react"

import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type {
  SelectedTicket,
  TicketContext
} from "@/features/command-menu/lib/commandMenu"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { stagedCount } from "@/features/tickets/lib/stagedChanges"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
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

const NO_STATUSES: ReadonlyArray<ProjectStatus> = []

export function TicketStatusCommands({
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
  const result = useAtomValue(
    statusesFor(statusesRequest(ticket.orgSlug, ticket.slug))
  )
  const statuses = Result.isSuccess(result) ? result.value : NO_STATUSES
  const { current, update } = useTicketMutation(ticket, selection)
  const bySlug = new Map<string, ProjectStatus>(
    statuses.map((status) => [status.slug, status])
  )
  // Several tickets: a pick is staged, and Apply (or picking it again)
  // sends it.
  const many = selection.length > 1
  const [staged, setStaged] = useState<ProjectStatus["slug"] | null>(null)
  const groups = groupBy(selection, (each) => each.status)
  const counts = new Map<string, number>(
    groups.map(([status, ids]) => [status, ids.length])
  )
  const apply = (status: ProjectStatus["slug"]) => {
    update({ status })
    onClose()
  }
  const value = (slug: string) => {
    const meta = statusMetaFor(slug, statuses)
    return (
      <StagedValue
        label={meta.label}
        icon={
          <meta.icon
            className={meta.className}
            style={meta.color ? { color: meta.color } : undefined}
            strokeWidth={1.75}
          />
        }
      />
    )
  }
  const lines =
    staged === null
      ? []
      : groups
          .filter(([status]) => status !== staged)
          .map(([status, ids]) => ({
            key: status,
            count: ids.length,
            change: <StagedMove from={value(status)} to={value(staged)} />
          }))

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
        if (status === undefined) {
          onClose()
          return
        }
        if (!many || staged === status.slug) apply(status.slug)
        else setStaged(status.slug)
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
            {many && <StagedRowCount count={counts.get(item.value)} />}
            {number !== undefined && (
              <CommandMenuShortcut
                keys={number}
                keyLabels={keyLabels()}
                aria-hidden
              />
            )}
            <CommandMenuCheck
              checked={(staged ?? current?.status) === item.value}
              label={m.chrome_command_menu_selected()}
            />
          </CommandMenuItem>
        )
      }}
    />
  )
}
