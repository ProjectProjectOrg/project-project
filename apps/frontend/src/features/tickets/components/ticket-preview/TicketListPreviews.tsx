import { useAtomValue } from "@effect/atom-react"
import {
  finishedStatusSlugs,
  type TicketId,
  type TicketStatus
} from "@pp/shared"
import { closeHoverCard } from "@pp/ui/hover-card"
import { TicketLine, TicketLines, TicketLinesLabel } from "@pp/ui/ticket-lines"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { Fragment } from "react"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  childTickets,
  childTicketsRequest
} from "@/features/tickets/atoms/childTickets"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { TicketStatusIcon } from "@/features/tickets/components/ticket-marks/TicketStatusIcon"
import { RELATION_PREVIEW_LABELS } from "@/features/tickets/lib/relationGroups"
import {
  previewRelationGroups,
  type RelationPreviewKind
} from "@/features/tickets/lib/relationGroups"
import type { TicketDetailSearch } from "@/features/tickets/lib/ticketSearch"
import { m } from "@/paraglide/messages"

export function RelationsPreview({
  id,
  relation
}: Readonly<{ id: TicketId; relation: RelationPreviewKind }>) {
  const { orgSlug, slug } = useProjectRoute()
  const detail = useAtomValue(ticketDetail(ticketRequest(orgSlug, slug, id)))
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  if (!Result.isSuccess(detail) || !Result.isSuccess(statuses)) {
    return <ListSkeleton />
  }
  const finished = new Set(finishedStatusSlugs(statuses.value))
  const groups = previewRelationGroups(
    detail.value.relations,
    relation,
    finished
  )
  if (groups.length === 0) return <PreviewEmpty />
  return (
    <TicketLines>
      {groups.map((group) => (
        <Fragment key={group.key}>
          <TicketLinesLabel>
            {RELATION_PREVIEW_LABELS[group.key]()}
          </TicketLinesLabel>
          {group.tickets.map((ticket) => (
            <PreviewTicketRow key={ticket.id} ticket={ticket} />
          ))}
        </Fragment>
      ))}
    </TicketLines>
  )
}

export function SubTicketsPreview({
  id,
  label,
  current,
  search
}: Readonly<{
  id: TicketId
  label: string
  current?: TicketId
  search?: TicketDetailSearch
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const rows = useAtomValue(
    childTickets(childTicketsRequest(orgSlug, slug, id))
  )
  if (!Result.isSuccess(rows)) return <ListSkeleton />
  return (
    <TicketLines>
      <TicketLinesLabel>{label}</TicketLinesLabel>
      {rows.value.map(({ key, ticket }) => (
        <PreviewTicketRow
          key={key}
          ticket={ticket}
          current={ticket.id === current}
          search={search}
        />
      ))}
    </TicketLines>
  )
}

// A previewed ticket: a menu row (TicketLine) that opens the ticket and
// closes the card at once.
function PreviewTicketRow({
  ticket,
  current = false,
  search
}: Readonly<{
  ticket: Readonly<{ id: TicketId; title: string; status: TicketStatus }>
  current?: boolean
  search?: TicketDetailSearch
}>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <TicketLine
      status={
        <TicketStatusIcon
          status={ticket.status}
          orgSlug={orgSlug}
          slug={slug}
        />
      }
      ticketKey={ticket.id}
      title={ticket.title}
      current={current}
      onClick={closeHoverCard}
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug, slug, id: ticket.id }}
          search={search ?? {}}
          preload="intent"
        />
      }
    />
  )
}

function PreviewEmpty() {
  return (
    <div className="px-2 py-1.5 text-caption text-muted-foreground">
      {m.tickets_preview_empty()}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2 p-2">
      <div className="h-3 w-1/3 rounded bg-muted" />
      <div className="h-4 w-full rounded bg-muted" />
    </div>
  )
}
