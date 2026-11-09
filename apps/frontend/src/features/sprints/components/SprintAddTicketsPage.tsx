import { RegistryContext, useAtomValue } from "@effect/atom-react"
import type { Ticket } from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Result from "effect/reactivity/AsyncResult"
import { Check } from "lucide-react"
import { useContext, useState } from "react"

import { CommandMenuItem } from "@/components/ui/command-menu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import {
  assignTicketToSprint,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  recentTickets,
  recentTicketsRequest
} from "@/features/tickets/atoms/myTickets"
import {
  searchRequest,
  ticketSearch
} from "@/features/tickets/atoms/ticketSearch"
import { TicketStatusIcon } from "@/features/tickets/components/ticket-marks/TicketStatusIcon"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { SprintContextChip, type SprintPageProps } from "./SprintCommandPages"

const RECENT_LIMIT = 5

export function SprintAddTicketsPage({ sprint, onBack }: SprintPageProps) {
  const { orgSlug, slug, sprints } = sprint
  const [search, setSearch] = useState("")
  const [debounced] = useDebouncedValue(search.trim(), { wait: 150 })
  const searching = debounced.length > 0
  const recentResult = useAtomValue(
    recentTickets(recentTicketsRequest(orgSlug))
  )
  const recent: ReadonlyArray<Ticket> =
    searching || !Result.isSuccess(recentResult)
      ? []
      : recentResult.value.tickets
          .flatMap((row) => (row.project.slug === slug ? [row.ticket] : []))
          .slice(0, RECENT_LIMIT)
  const recentIds = new Set(recent.map((ticket) => ticket.id))
  const searchResult = useAtomValue(
    ticketSearch(
      searchRequest(orgSlug, slug, {
        q: searching ? debounced : undefined,
        limit: 24
      })
    )
  )
  const found: ReadonlyArray<Ticket> = Result.isSuccess(searchResult)
    ? searchResult.value.filter((ticket) => !recentIds.has(ticket.id))
    : []
  const candidates = [...recent, ...found].filter(
    (ticket) => ticket.type !== "epic"
  )
  const byId = new Map<string, Ticket>(
    candidates.map((ticket) => [ticket.id, ticket])
  )
  const otherSprint = (ticket: Ticket) =>
    sprints.find(
      (other) =>
        other.id !== sprint.sprint.id &&
        other.completedAt === null &&
        other.tickets.includes(ticket.id)
    ) ?? null
  const registry = useContext(RegistryContext)
  return (
    <CommandFrame
      chip={<SprintContextChip sprint={sprint} />}
      placeholder={m.sprints_add_tickets_placeholder({
        name: sprint.sprint.name
      })}
      onBack={onBack}
      filter={false}
      onSearchChange={setSearch}
      items={candidates.map((ticket) => ({
        value: ticket.id,
        label: `${ticket.id} ${ticket.title}`,
        group: recentIds.has(ticket.id)
          ? m.tickets_mark_group_recent()
          : m.tickets_mark_group_results()
      }))}
      onSelect={(item) => {
        const ticket = byId.get(item.value)
        if (ticket && !sprint.sprint.tickets.includes(ticket.id)) {
          assignTicketToSprint(
            registry,
            sprintListRequest(orgSlug, slug),
            ticket.id,
            sprint.sprint.id
          )
        }
      }}
      renderItem={(item) => {
        const ticket = byId.get(item.value)
        if (!ticket) return null
        const inSprint = sprint.sprint.tickets.includes(ticket.id)
        const elsewhere = otherSprint(ticket)
        return (
          <CommandMenuItem
            value={item.value}
            aria-disabled={inSprint}
            className={cn(inSprint && "opacity-60")}
          >
            <TicketStatusIcon
              status={ticket.status}
              orgSlug={orgSlug}
              slug={slug}
              className="size-4"
            />
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {ticket.id}
              </span>
              <span className="min-w-0 truncate">{ticket.title}</span>
            </span>
            {inSprint ? (
              <span className="flex shrink-0 items-center gap-1 text-xs">
                <Check className="size-3.5" strokeWidth={1.75} />
                {m.sprints_add_epic_in_sprint()}
              </span>
            ) : elsewhere !== null ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {m.sprints_add_tickets_in_other_sprint({
                  name: elsewhere.name
                })}
              </span>
            ) : null}
          </CommandMenuItem>
        )
      }}
    />
  )
}
