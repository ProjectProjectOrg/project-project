import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type { Comment, TicketDetail } from "@pp/shared"
import { CornerDownLeft } from "@pp/ui/icons"
import { Link } from "@tanstack/react-router"

import { AsyncView } from "@/components/shell/AsyncView"
import { ReadFailure } from "@/components/shell/ReadFailure"
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

type CreatedRef = Comment["tickets"][number]

export function CreatedTickets({
  tickets
}: Readonly<{ tickets: ReadonlyArray<CreatedRef> }>) {
  if (tickets.length === 0) return null
  return (
    <ul className="mt-2 flex flex-col gap-1.5 text-body">
      {tickets.map((ref) => (
        <CreatedTicket
          key={`${ref.projectSlug ?? ""}/${ref.id}`}
          created={ref}
        />
      ))}
    </ul>
  )
}

function CreatedTicket({ created: ref }: Readonly<{ created: CreatedRef }>) {
  const route = useProjectRoute()
  const orgSlug = route.orgSlug
  const slug = ref.projectSlug ?? route.slug
  const id = ref.id
  const atom = ticketDetail(ticketRequest(orgSlug, slug, id))
  const result = useAtomValue(atom)
  const refresh = useAtomRefresh(atom)
  return (
    <li className="flex flex-col gap-0.5">
      <AsyncView
        result={result}
        onInitial={() => null}
        onFailure={(failure) => (
          <ReadFailure failure={failure} onRetry={refresh} />
        )}
        onSuccess={({ value: ticket }) => (
          <CreatedTicketLine ticket={ticket} orgSlug={orgSlug} slug={slug} />
        )}
      />
    </li>
  )
}

function CreatedTicketLine({
  ticket,
  orgSlug,
  slug
}: Readonly<{ ticket: TicketDetail; orgSlug: string; slug: string }>) {
  const { members } = useProject()
  const creator = members.find((member) => member.id === ticket.createdBy)
  return (
    <>
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <CornerDownLeft
          className="size-3.5 -scale-x-100"
          strokeWidth={1.75}
          aria-hidden
        />
        {m.comments_created_ticket({
          name: creator?.name || creator?.email || ticket.createdBy
        })}
      </span>
      <Link
        to="/orgs/$orgSlug/projects/$slug/tickets/$id"
        params={{ orgSlug, slug, id: ticket.id }}
        className="flex min-w-0 items-center gap-1.5 rounded-md text-foreground transition-colors hover:text-muted-foreground"
      >
        <TicketStatusIcon
          status={ticket.status}
          orgSlug={orgSlug}
          slug={slug}
        />
        <span className="shrink-0 text-muted-foreground tabular-nums">
          {ticket.id}
        </span>
        <span className="truncate">{ticket.title}</span>
        <span aria-hidden className="text-muted-foreground">
          ·
        </span>
        <TimelineTime at={ticket.createdAt} className="shrink-0" />
      </Link>
    </>
  )
}
