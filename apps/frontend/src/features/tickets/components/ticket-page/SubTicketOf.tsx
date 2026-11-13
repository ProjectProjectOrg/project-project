import { useAtomValue } from "@effect/atom-react"
import { isEpic, type TicketDetail } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import { Button } from "@/components/ui/button"
import { MiddleTruncate } from "@/components/ui/middle-truncate"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { SubTicketsChip } from "@/features/tickets/components/ticket-preview/PreviewChips"
import { TicketPreviewTrigger } from "@/features/tickets/components/ticket-preview/TicketPreview"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import type { TicketPageSource } from "@/features/tickets/lib/ticketSearch"
import { resolveType } from "@/features/tickets/lib/ticketTypes"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function SubTicketOf({
  ticket,
  from
}: Readonly<{
  ticket: Pick<TicketDetail, "id" | "parent" | "parentState">
  from: TicketPageSource | undefined
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const types = useTicketTypes(orgSlug, slug)
  const { parent, parentState } = ticket
  if (parent === null) return null
  const status =
    isEpic(parent) || parentState === null
      ? null
      : statusMetaFor(
          parentState.status,
          Result.isSuccess(statuses) ? statuses.value : []
        )
  return (
    <span className="flex min-w-0 items-center pl-2 text-body text-muted-foreground [--fs-body:13px] [--lh-body:20px] [--text-body--line-height:20px] [--text-body:13px]">
      <span className="shrink-0">
        {isEpic(parent)
          ? m.tickets_header_in_epic()
          : m.tickets_header_sub_ticket_of()}
      </span>
      <TicketPreviewTrigger
        preview={{ kind: "ticket", id: parent.id }}
        render={
          <Button
            variant="chip-muted"
            className="h-6 min-w-0 gap-1 px-1.5"
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                params={{ orgSlug, slug, id: parent.id }}
                preload="intent"
              />
            }
          />
        }
      >
        {status === null ? (
          <TypeGlyph
            type={resolveType(types, parent.type)}
            className="size-3.5"
          />
        ) : (
          <status.icon
            className={cn("size-3.5 shrink-0", status.className)}
            style={status.color ? { color: status.color } : undefined}
            strokeWidth={1.75}
          />
        )}
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 font-mono text-body text-muted-foreground tabular-nums">
            {parent.id}
          </span>
          <MiddleTruncate
            value={parent.title}
            title={undefined}
            className="text-foreground"
          />
        </span>
      </TicketPreviewTrigger>
      {parentState !== null && (
        <SubTicketsChip
          ticket={{
            id: parent.id,
            subTicketCount: parentState.subTicketCount,
            subTicketDoneCount: parentState.subTicketDoneCount
          }}
          current={ticket.id}
          search={
            from?.kind === "parent"
              ? { from: "parent", parentId: from.parent }
              : undefined
          }
        />
      )}
    </span>
  )
}
