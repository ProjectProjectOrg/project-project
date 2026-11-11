import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { EMPTY_TICKET_RELATIONS, type Ticket } from "@pp/shared"
import { useDebouncedValue } from "@tanstack/react-pacer"
import * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import { CircleAlert, Search } from "lucide-react"
import { useState, type ReactNode } from "react"

import { CommandMenuItem } from "@/components/ui/command-menu"
import {
  CommandFrame,
  type CommandEmpty
} from "@/features/command-menu/components/CommandFrame"
import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import {
  recentTickets,
  recentTicketsRequest
} from "@/features/tickets/atoms/myTickets"
import {
  archiveTicket,
  markTicket,
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import {
  searchRequest,
  ticketSearch
} from "@/features/tickets/atoms/ticketSearch"
import {
  pickBlock,
  type MarkPickKind,
  type PickBlock
} from "@/features/tickets/lib/relationGroups"
import { useSettledValue } from "@/hooks/useSettledValue"
import { errorMessage } from "@/lib/errorMessage"
import { cn } from "@/lib/utils"
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
  onDone
}: Readonly<{
  ticket: TicketContext
  kind: MarkPickKind
  chip: ReactNode
  onBack: () => void
  onDone: () => void
}>) {
  const req = ticketRequest(orgSlug, slug, ticketId)
  const detail = useAtomValue(ticketDetail(req))
  const relations = Result.isSuccess(detail)
    ? detail.value.relations
    : EMPTY_TICKET_RELATIONS
  const mark = useAtomSet(markTicket(req), { mode: "promiseExit" })
  const archive = useAtomSet(archiveTicket(req), { mode: "promiseExit" })
  const [search, setSearch] = useState("")
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
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
    onSuccess: (): CommandEmpty | undefined => undefined
  })

  const pick = async (target: Ticket) => {
    if (pending) return
    setPending(true)
    setFailure(null)
    const exit =
      kind === "duplicateOf"
        ? await archive({ duplicateOf: target.id })
        : await mark({ kind, target: target.id })
    setPending(false)
    if (Exit.isSuccess(exit)) onDone()
    else setFailure(errorMessage(Cause.squash(exit.cause)))
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
      notice={failure}
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
          void pick(target)
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
              <span className="min-w-(--row-key-width) shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
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
