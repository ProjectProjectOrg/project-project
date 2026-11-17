import { useAtomValue } from "@effect/atom-react"
import type { TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { CornerDownRight } from "lucide-react"

import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketStatusIcon } from "@/features/tickets/components/ticket-marks/TicketStatusIcon"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { m } from "@/paraglide/messages"

export function CreatedTickets({
  tickets
}: Readonly<{ tickets: ReadonlyArray<TicketId> }>) {
  if (tickets.length === 0) return null
  return (
    <ul className="mt-2 flex flex-col gap-1.5 text-body">
      {tickets.map((id) => (
        <CreatedTicket key={id} id={id} />
      ))}
    </ul>
  )
}

function CreatedTicket({ id }: Readonly<{ id: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const { members } = useProject()
  const result = useAtomValue(ticketDetail(ticketRequest(orgSlug, slug, id)))
  if (!Result.isSuccess(result)) return null
  const ticket = result.value
  const creator = members.find((member) => member.id === ticket.createdBy)
  return (
    <li className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <CornerDownRight className="size-3.5" strokeWidth={1.75} aria-hidden />
        {m.comments_created_ticket({
          name: creator?.name ?? creator?.email ?? ticket.createdBy
        })}
      </span>
      <Link
        to="/orgs/$orgSlug/projects/$slug/tickets/$id"
        params={{ orgSlug, slug, id }}
        className="flex min-w-0 items-center gap-1.5 rounded-md text-foreground transition-colors hover:text-muted-foreground"
      >
        <TicketStatusIcon
          status={ticket.status}
          orgSlug={orgSlug}
          slug={slug}
        />
        <span className="shrink-0 font-mono text-muted-foreground tabular-nums">
          {ticket.id}
        </span>
        <span className="truncate">{ticket.title}</span>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <TimelineTime at={ticket.createdAt} className="shrink-0" />
      </Link>
    </li>
  )
}
