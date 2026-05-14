import { Result, useAtomValue } from "@effect-atom/atom-react"
import { Link } from "@tanstack/react-router"
import { useMentionScope } from "@/mentions/scope"
import { ticketAtom, ticketKey } from "@/atoms/tickets"
import { m } from "@/paraglide/messages"
import type { TicketId } from "@projectproject/shared"

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

function CardSkeleton({ id }: { id: TicketId }) {
  return (
    <div className="space-y-2">
      <div className="font-mono text-xs text-muted-foreground">{id}</div>
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-3 w-1/2 rounded bg-muted" />
    </div>
  )
}
