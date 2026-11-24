import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import { EMPTY_TICKET_RELATIONS, type Ticket } from "@pp/shared"
import { CommandMenuItem } from "@pp/ui/command-menu"
import { CircleAlert, Search } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Result from "effect/reactivity/AsyncResult"
import { useContext, useState, type ReactNode } from "react"

import { fireMutation } from "@/api/viewMutation"
import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import {
  CommandFrame,
  type CommandEmpty
} from "@/features/command-menu/components/CommandFrame"
import {
  commandMenuRow,
  pointedAt,
  type TicketContext
} from "@/features/command-menu/lib/commandMenu"
import { markDuplicateRequest } from "@/features/tickets/atoms/markDuplicateRequest"
import {
  recentTickets,
  recentTicketsRequest
} from "@/features/tickets/atoms/myTickets"
import { runTicketAction } from "@/features/tickets/atoms/ticketActionFailures"
import {
  markTicket,
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import {
  searchRequest,
  ticketSearch
} from "@/features/tickets/atoms/ticketSearch"
import {
  linkedTicket,
  pickBlock,
  type MarkPickKind,
  type PickBlock
} from "@/features/tickets/lib/relationGroups"
import { useSettledValue } from "@/hooks/useSettledValue"
import { m } from "@/paraglide/messages"

import { TicketStatusIcon } from "./TicketStatusIcon"

const RECENT_LIMIT = 5

const PLACEHOLDERS: Readonly<Record<MarkPickKind, () => string>> = {
  blockedBy: m.tickets_mark_placeholder_blocked_by,
  blocking: m.tickets_mark_placeholder_blocking,
  related: m.tickets_mark_placeholder_related,
  duplicateOf: m.tickets_mark_placeholder_duplicate_of
}

const BLOCK_LABELS: Readonly<Record<Exclude<PickBlock, null>, () => string>> = {
  linked: m.tickets_mark_reason_linked,
  loop: m.tickets_mark_reason_loop
}

const NO_TICKETS: ReadonlyArray<Ticket> = []

export function MarkTicketCommand({
  ticket: { orgSlug, slug, ticketId },
  kind,
  chip,
  onBack,
  onDone,
  onDuplicate
}: Readonly<{
  ticket: TicketContext
  kind: MarkPickKind
  chip: ReactNode
  onBack: () => void
  onDone: () => void
  // Duplicates are confirmed on a page of their own (both tickets side by
  // side): this opens it once the request is set.
  onDuplicate: () => void
}>) {
  const registry = useContext(RegistryContext)
  const req = ticketRequest(orgSlug, slug, ticketId)
  const detail = useAtomValue(ticketDetail(req))
  const relations = Result.isSuccess(detail)
    ? detail.value.relations
    : EMPTY_TICKET_RELATIONS
  const setDuplicate = useAtomSet(markDuplicateRequest)
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
          .flatMap((row) =>
            row.project.slug === slug && row.ticket.id !== ticketId
              ? [row.ticket]
              : []
          )
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
  const found = useSettledValue(searchResult, NO_TICKETS).filter(
    (ticket) => ticket.id !== ticketId && !recentIds.has(ticket.id)
  )

  const byId = new Map<string, Ticket>(
    [...recent, ...found].map((ticket) => [ticket.id, ticket])
  )
  const empty: CommandEmpty | undefined = Result.matchWithError(searchResult, {
    onInitial: () => ({
      icon: Search,
      title: m.tickets_mark_loading(),
      description: ""
    }),
    onError: () => ({
      icon: CircleAlert,
      title: m.tickets_mark_failed(),
      description: ""
    }),
    onDefect: () => ({
      icon: CircleAlert,
      title: m.tickets_mark_failed(),
      description: ""
    }),
    onSuccess: () => undefined
  })

  const pick = (target: Ticket) => {
    if (kind === "duplicateOf") {
      setDuplicate({ orgSlug, slug, ticketId, originalId: target.id })
      onDuplicate()
      return
    }
    const row = pointedAt(commandMenuRow(registry.get(commandMenuState)), {
      orgSlug,
      slug,
      ticketId
    })
    const input = { kind, target: linkedTicket(target) }
    void runTicketAction(
      registry,
      { orgSlug, slug },
      {
        kind: "mark",
        relation: kind,
        source: ticketId,
        target: target.id
      },
      () =>
        row?.mark
          ? row.mark(registry, { ...input, source: linkedTicket(row.row) })
          : fireMutation(registry, markTicket(req), input).then(Result.toExit)
    )
    onDone()
  }

  return (
    <CommandFrame
      fixedHeight
      chip={chip}
      placeholder={PLACEHOLDERS[kind]()}
      onBack={onBack}
      filter={false}
      onSearchChange={setSearch}
      empty={empty}
      items={[
        ...recent.map((ticket) => ({
          value: ticket.id,
          label: `${ticket.id} ${ticket.title}`,
          prefix: ticket.id,
          group: m.tickets_mark_group_recent()
        })),
        ...found.map((ticket) => ({
          value: ticket.id,
          label: `${ticket.id} ${ticket.title}`,
          prefix: ticket.id,
          group: m.tickets_mark_group_results()
        }))
      ]}
      onSelect={(picked) => {
        const target = byId.get(picked.value)
        if (target && pickBlock(relations, kind, target.id) === null) {
          pick(target)
        }
      }}
      renderItem={(row) => {
        const ticket = byId.get(row.value)
        if (!ticket) return null
        const block = pickBlock(relations, kind, ticket.id)
        return (
          <CommandMenuItem value={row.value} aria-disabled={block !== null}>
            <TicketStatusIcon
              status={ticket.status}
              orgSlug={orgSlug}
              slug={slug}
              className="size-4"
            />
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="min-w-(--row-key-width) shrink-0 text-caption text-muted-foreground tabular-nums">
                {ticket.id}
              </span>
              <span
                className={cn(
                  "min-w-0 truncate",
                  block !== null && "opacity-50"
                )}
              >
                {ticket.title}
              </span>
            </span>
            {block !== null && (
              <span className="shrink-0 text-caption text-muted-foreground">
                {BLOCK_LABELS[block]()}
              </span>
            )}
          </CommandMenuItem>
        )
      }}
    />
  )
}
