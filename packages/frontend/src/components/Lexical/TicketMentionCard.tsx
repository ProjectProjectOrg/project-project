import { Result, useAtomValue } from "@effect-atom/atom-react"
import { Link } from "@tanstack/react-router"
import { useMentionScope } from "@/mentions/scope"
import { ticketAtom, ticketKey } from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import { PRIORITY_LABELS, PRIORITY_META } from "@/lib/priority-meta"
import {
  STATUS_LABELS,
  STATUS_META,
  TYPE_LABELS,
  TYPE_META
} from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"
import type {
  TicketId,
  TicketPriority,
  TicketStatus,
  TicketType
} from "@projectproject/shared"

function firstBodyLine(body: string): string | null {
  for (const raw of body.split("\n")) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith("#")) continue
    return line
  }
  return null
}

export function TicketMentionCard({ ticketId }: { ticketId: TicketId }) {
  const scope = useMentionScope()
  if (!scope) return null
  const result = useAtomValue(
    ticketAtom(ticketKey(scope.orgSlug, scope.slug, ticketId))
  )

  if (Result.isFailure(result)) {
    return (
      <div className="text-xs text-muted-foreground">
        {m.tickets_mention_card_not_available()}
      </div>
    )
  }

  if (!Result.isSuccess(result)) {
    return <CardSkeleton id={ticketId} />
  }

  const ticket = result.value

  return (
    <div className="space-y-2">
      <div className="font-mono text-xs text-muted-foreground">{ticket.id}</div>
      <div className="line-clamp-2 text-sm font-medium leading-snug">
        {ticket.title}
      </div>
      <MetaRow ticket={ticket} />
      {(() => {
        const line = firstBodyLine(ticket.body)
        return line ? (
          <p className="truncate text-xs italic text-muted-foreground">
            {line}
          </p>
        ) : null
      })()}
      <div className="border-t border-border pt-2 text-right">
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug: scope.orgSlug, slug: scope.slug, id: ticketId }}
          className="text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          {m.tickets_mention_card_view_ticket()} →
        </Link>
      </div>
    </div>
  )
}

function MetaRow({
  ticket
}: {
  ticket: {
    status: TicketStatus
    type: TicketType
    priority: TicketPriority
  }
}) {
  const status = STATUS_META[ticket.status]
  const type = TYPE_META[ticket.type]
  const priority = PRIORITY_META[ticket.priority]
  const StatusIcon = status.icon
  const TypeIcon = type.icon
  const PriorityIcon = priority.icon
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <StatusIcon
          className={cn("size-3.5", status.className)}
          strokeWidth={1.75}
        />
        <span>{STATUS_LABELS[ticket.status]()}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <TypeIcon className="size-3.5" strokeWidth={1.75} />
        <span>{TYPE_LABELS[ticket.type]()}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <PriorityIcon
          className={cn("size-3.5", priority.className)}
          strokeWidth={1.75}
        />
        <span>{PRIORITY_LABELS[ticket.priority]()}</span>
      </span>
    </div>
  )
}

function CardSkeleton({ id }: { id: TicketId }) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-xs text-muted-foreground">{id}</div>
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-3 w-1/2 rounded bg-muted" />
    </div>
  )
}
