import { useAtomSet } from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import type { Member, Ticket } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { memo, type ReactNode, use } from "react"

import { DeferredDropdownMenus } from "@/components/ui/dropdown-menu"
import { usePointedTicket } from "@/features/command-menu/hooks/usePointedTicket"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import { AssigneeField } from "@/features/tickets/components/ticket-list/AssigneeField"
import { UpdateFailureMarker } from "@/features/tickets/components/ticket-list/UpdateFailureMarker"
import { TicketContextMenu } from "@/features/tickets/components/ticket-menu/TicketMenu"
import { TicketViewSourceContext } from "@/features/tickets/hooks/ticketViewSource"
import { useDisplayProperties } from "@/features/tickets/hooks/useDisplayProperties"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { useProjectActor } from "@/hooks/useActor"

import { BoardCardChildren, useChildTicketsPreload } from "./BoardCardChildren"
import { BoardCardProperties, ParentTicketCrumb } from "./BoardCardProperties"

function SprintBoardCardImpl({
  update,
  ticket,
  members
}: Readonly<{
  update: TicketUpdates
  ticket: Ticket
  members: ReadonlyArray<Member>
}>) {
  const onPatch = useAtomSet(update(ticket.id))
  return (
    <BoardCardFields
      ticket={ticket}
      members={members}
      onPatch={onPatch}
      failure={<UpdateFailureMarker update={update(ticket.id)} />}
    />
  )
}

function BoardCardFields({
  ticket,
  members,
  onPatch,
  failure
}: Readonly<{
  ticket: Ticket
  members: ReadonlyArray<Member>
  onPatch: (patch: TicketEdit) => void
  failure: ReactNode
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const from = use(TicketViewSourceContext)
  const pointAt = usePointedTicket(orgSlug, slug, ticket.id)
  const preloadChildren = useChildTicketsPreload(ticket)
  const actor = useProjectActor()
  const editable = TicketPolicy.canChange(actor, { content: true })
  const canAssign = TicketPolicy.canChange(actor, { assignees: true })
  const { shows } = useDisplayProperties()
  return (
    <DeferredDropdownMenus>
      <TicketContextMenu
        ticket={ticket}
        members={members}
        onPatch={onPatch}
        fromList
      >
        <div
          {...pointAt}
          data-board-card={ticket.id}
          onPointerEnter={(event) => {
            pointAt.onPointerEnter(event)
            preloadChildren()
          }}
          className="relative isolate flex flex-col rounded-lg bg-surface-3 px-2.5 pt-2 pb-1 text-left shadow-surface-1 transition outline-none not-in-data-keyboard-navigation:hover:bg-surface-4 not-in-data-keyboard-navigation:hover:shadow-surface-1-hover in-data-keyboard-navigation:duration-0 has-[[data-popup-open]]:bg-surface-4 has-[[data-popup-open]]:shadow-surface-1-hover has-[[data-row-link]:focus-visible]:bg-surface-4 has-[[data-row-link]:focus-visible]:shadow-surface-1-hover has-[[data-row-link]:focus-visible]:duration-0 data-[popup-open]:bg-surface-4 data-[popup-open]:shadow-surface-1-hover [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-20 [&_button]:relative [&_button]:z-20"
        >
          <Link
            to="/orgs/$orgSlug/projects/$slug/tickets/$id"
            params={{ orgSlug, slug, id: ticket.id }}
            search={from ?? {}}
            preload="intent"
            draggable={false}
            data-row-link
            aria-label={`${ticket.id} ${ticket.title}`}
            aria-haspopup="menu"
            aria-keyshortcuts="Shift+F10"
            className="absolute inset-0 z-10 rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
          />
          <div className="flex min-w-0 flex-col gap-2.5 pb-1">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex h-5 min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
                <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                  <span className="shrink-0 font-mono tabular-nums">
                    {ticket.id}
                  </span>
                  {ticket.parent && ticket.parent.type !== "epic" && (
                    <ParentTicketCrumb parent={ticket.parent} />
                  )}
                </span>
                {shows("assignee") && (
                  <span className="ml-auto flex shrink-0 items-center">
                    <fieldset disabled={!canAssign} className="contents">
                      <AssigneeField
                        ticket={ticket}
                        members={members}
                        variant="card"
                        onPatch={onPatch}
                      />
                    </fieldset>
                  </span>
                )}
              </div>
              <div className="min-w-0 text-subtitle leading-snug font-semibold">
                <span className="line-clamp-2">{ticket.title}</span>
              </div>
            </div>
            <BoardCardProperties
              ticket={ticket}
              editable={editable}
              onPatch={onPatch}
              failure={failure}
            />
          </div>
          <BoardCardChildren parent={ticket} />
        </div>
      </TicketContextMenu>
    </DeferredDropdownMenus>
  )
}

export const SprintBoardCard = memo(SprintBoardCardImpl)
