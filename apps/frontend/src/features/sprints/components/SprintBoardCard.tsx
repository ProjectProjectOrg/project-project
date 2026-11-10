import { useAtomSet } from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import type { Member, Ticket, UpdateTicketInput } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { memo, type ReactNode } from "react"

import { DeferredDropdownMenus } from "@/components/ui/dropdown-menu"
import { usePointedTicket } from "@/features/command-menu/hooks/usePointedTicket"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import { AssigneeField } from "@/features/tickets/components/ticket-list/AssigneeField"
import { UpdateFailureMarker } from "@/features/tickets/components/ticket-list/UpdateFailureMarker"
import { TicketContextMenu } from "@/features/tickets/components/ticket-menu/TicketMenu"
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
  onPatch: (patch: UpdateTicketInput) => void
  failure: ReactNode
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const pointAt = usePointedTicket(orgSlug, slug, ticket.id)
  const preloadChildren = useChildTicketsPreload(ticket)
  const actor = useProjectActor()
  const editable = TicketPolicy.canChange(actor, { content: true })
  const canAssign = TicketPolicy.canChange(actor, { assignees: true })
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
          onPointerEnter={() => {
            pointAt.onPointerEnter()
            preloadChildren()
          }}
          className="relative isolate flex flex-col rounded-lg bg-surface-3 px-2.5 pt-2 pb-1 text-left shadow-surface-1 transition outline-none hover:bg-surface-4 hover:shadow-surface-1-hover has-[[data-popup-open]]:bg-surface-4 has-[[data-popup-open]]:shadow-surface-1-hover data-[popup-open]:bg-surface-4 data-[popup-open]:shadow-surface-1-hover [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-20 [&_button]:relative [&_button]:z-20"
        >
          <div className="flex min-w-0 flex-col gap-2.5 pb-1">
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex h-5 min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
                <span className="shrink-0 tabular-nums">{ticket.id}</span>
                {ticket.parent && (
                  <ParentTicketCrumb parentId={ticket.parent} />
                )}
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
              </div>
              <Link
                to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                params={{ orgSlug, slug, id: ticket.id }}
                preload="intent"
                draggable={false}
                data-row-link
                className="min-w-0 text-subtitle leading-snug font-semibold outline-none after:absolute after:inset-0 after:z-10 after:rounded-lg after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
              >
                <span className="line-clamp-2">{ticket.title}</span>
              </Link>
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
