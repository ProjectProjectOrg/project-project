import { isEpic, canHoldChildren } from "@pp/shared"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@pp/ui/dropdown-menu"
import { ListPlus } from "@pp/ui/icons"

import type { RelatedKind } from "@/features/tickets/atoms/createTicket"
import { SquarePlusCorner } from "@/features/tickets/components/ticket-marks/blockingIcon"
import { MARK_KINDS } from "@/features/tickets/components/ticket-marks/markKinds"
import { m } from "@/paraglide/messages"

import type { TicketMenuTicket } from "./TicketMenu"
import { useOpenTicketPage } from "./useOpenTicketPage"

type Related = Pick<TicketMenuTicket, "id" | "type" | "parent">

// "Create related" in the ticket menu. Picking a kind opens the new-ticket
// composer in a popover from the ticket (onCreate), not a dialog.
export function CreateRelatedSubmenu({
  ticket,
  canAttach,
  onCreate
}: Readonly<{
  ticket: Related
  canAttach: boolean
  onCreate: (kind: RelatedKind) => void
}>) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <SquarePlusCorner className="size-4" strokeWidth={1.75} />
        {m.tickets_menu_create_related()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-w-72 min-w-48">
        <CreateRelatedItems
          ticket={ticket}
          canAttach={canAttach}
          onCreate={onCreate}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function CreateRelatedItems({
  ticket,
  canAttach,
  onCreate: create
}: Readonly<{
  ticket: Related
  canAttach: boolean
  onCreate: (kind: RelatedKind) => void
}>) {
  const openPage = useOpenTicketPage(ticket.id)
  const holdsChildren = canHoldChildren(ticket, ticket.parent)
  return (
    <>
      {holdsChildren && (
        <>
          <DropdownMenuItem
            onClick={() => create("subTicket")}
            className="cursor-pointer"
          >
            <ListPlus className="size-4" strokeWidth={1.75} />
            {isEpic(ticket)
              ? m.tickets_menu_related_epic_ticket()
              : m.tickets_menu_related_sub_ticket()}
          </DropdownMenuItem>
          {canAttach && (
            <DropdownMenuItem
              onClick={() => openPage("ticketSubTicket")}
              className="cursor-pointer"
            >
              <ListPlus className="size-4" strokeWidth={1.75} />
              {m.tickets_menu_attach_sub_ticket()}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
        </>
      )}
      {MARK_KINDS.flatMap(({ kind, icon: Icon, label }) =>
        kind === "duplicateOf"
          ? []
          : [
              <DropdownMenuItem
                key={kind}
                onClick={() => create(kind)}
                className="cursor-pointer"
              >
                <Icon className="size-4" strokeWidth={1.75} />
                {label()}
              </DropdownMenuItem>
            ]
      )}
    </>
  )
}
