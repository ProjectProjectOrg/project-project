import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import type { Ticket, TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  childTicketUpdates,
  childTickets,
  childTicketsRequest
} from "@/features/tickets/atoms/childTickets"
import { NestToggle } from "@/features/tickets/components/ticket-list/NestTree"
import { StatusButton } from "@/features/tickets/components/ticket-list/StatusField"
import { useSubTicketExpansion } from "@/features/tickets/components/ticket-list/SubTicketExpansion"
import { SubTicketProgress } from "@/features/tickets/components/ticket-list/SubTicketProgress"
import { useProjectActor } from "@/lib/access"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Parent = Pick<Ticket, "id" | "subTicketCount" | "subTicketDoneCount">

export function BoardCardProgress({ ticket }: Readonly<{ ticket: Parent }>) {
  const expansion = useSubTicketExpansion()
  if ((ticket.subTicketCount ?? 0) === 0) return null
  return (
    <span className="inline-flex items-center gap-0.5">
      {expansion !== null && (
        <NestToggle
          expanded={expansion.isExpanded(ticket.id)}
          onToggle={() => expansion.toggle(ticket.id)}
        />
      )}
      <SubTicketProgress ticket={ticket} />
    </span>
  )
}

export function BoardCardChildren({ parent }: Readonly<{ parent: Parent }>) {
  const expansion = useSubTicketExpansion()
  if (
    (parent.subTicketCount ?? 0) === 0 ||
    expansion === null ||
    !expansion.isExpanded(parent.id)
  ) {
    return null
  }
  return <ExpandedChildren parent={parent.id} />
}

function ExpandedChildren({ parent }: Readonly<{ parent: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = childTicketsRequest(orgSlug, slug, parent)
  const result = useAtomValue(childTickets(req))
  const status = Result.isInitial(result)
    ? m.tickets_sub_tickets_loading()
    : Result.isFailure(result)
      ? m.tickets_sub_tickets_load_failed()
      : null
  return (
    <ul className="flex flex-col gap-0.5 border-t border-border/60 pt-1.5">
      {status !== null ? (
        <li
          className={cn(
            "px-1 py-1 text-xs text-muted-foreground",
            Result.isInitial(result) && "animate-pulse"
          )}
        >
          {status}
        </li>
      ) : (
        Result.getOrElse(result, () => []).map((row) => (
          <ChildLine key={row.key} parent={parent} ticket={row.ticket} />
        ))
      )}
    </ul>
  )
}

function ChildLine({
  parent,
  ticket
}: Readonly<{ parent: TicketId; ticket: Ticket }>) {
  const { orgSlug, slug } = useProjectRoute()
  const editable = TicketPolicy.canChange(useProjectActor(), { content: true })
  const onPatch = useAtomSet(
    childTicketUpdates(childTicketsRequest(orgSlug, slug, parent))(ticket.id)
  )
  return (
    <li className="flex min-w-0 items-center gap-1.5 text-xs">
      <fieldset disabled={!editable} className="contents">
        <StatusButton ticket={ticket} stopPropagation onPatch={onPatch} />
      </fieldset>
      <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
        {ticket.id}
      </span>
      <Link
        to="/orgs/$orgSlug/projects/$slug/tickets/$id"
        params={{ orgSlug, slug, id: ticket.id }}
        preload="intent"
        draggable={false}
        title={ticket.title}
        className="min-w-0 truncate underline-offset-4 transition-colors hover:underline"
      >
        {ticket.title}
      </Link>
    </li>
  )
}
