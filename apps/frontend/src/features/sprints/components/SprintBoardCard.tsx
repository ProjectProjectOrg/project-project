import { useAtomSet } from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import { isEpic } from "@pp/shared"
import type { Member, Ticket } from "@pp/shared"
import { BoardCard } from "@pp/ui/board-card"
import { DeferredDropdownMenus } from "@pp/ui/dropdown-menu"
import { ItemLink } from "@pp/ui/item-link"
import { TicketKey } from "@pp/ui/ticket-key"
import { Link } from "@tanstack/react-router"
import { memo, type ReactNode, use } from "react"

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
        <BoardCard
          {...pointAt}
          data-board-card={ticket.id}
          flagged={ticket.flag !== null}
          onPointerEnter={(event) => {
            pointAt.onPointerEnter(event)
            preloadChildren()
          }}
          link={
            <ItemLink
              render={
                <Link
                  to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                  params={{ orgSlug, slug, id: ticket.id }}
                  search={from ?? {}}
                  preload="intent"
                />
              }
              aria-label={`${ticket.id} ${ticket.title}`}
              aria-haspopup="menu"
              aria-keyshortcuts="Shift+F10"
            />
          }
          meta={
            <>
              <TicketKey value={ticket.id} />
              {ticket.parent && !isEpic(ticket.parent) && (
                <ParentTicketCrumb parent={ticket.parent} />
              )}
            </>
          }
          assignee={
            shows("assignee") && (
              <fieldset disabled={!canAssign} className="contents">
                <AssigneeField
                  ticket={ticket}
                  members={members}
                  variant="card"
                  onPatch={onPatch}
                />
              </fieldset>
            )
          }
          title={ticket.title}
          properties={
            <BoardCardProperties
              ticket={ticket}
              editable={editable}
              onPatch={onPatch}
              failure={failure}
            />
          }
        >
          <BoardCardChildren parent={ticket} />
        </BoardCard>
      </TicketContextMenu>
    </DeferredDropdownMenus>
  )
}

export const SprintBoardCard = memo(SprintBoardCardImpl)
