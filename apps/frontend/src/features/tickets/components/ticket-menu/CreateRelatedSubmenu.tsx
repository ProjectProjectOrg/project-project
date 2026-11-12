import { useAtomSet } from "@effect/atom-react"
import { isEpic, canHoldChildren } from "@pp/shared"
import { ListPlus } from "lucide-react"

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from "@/components/ui/dropdown-menu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  createTicketDialog,
  type RelatedKind
} from "@/features/tickets/atoms/createTicketDialog"
import { SquarePlusCorner } from "@/features/tickets/components/ticket-marks/blockingIcon"
import { MARK_KINDS } from "@/features/tickets/components/ticket-marks/markKinds"
import { m } from "@/paraglide/messages"

import type { TicketMenuTicket } from "./TicketMenu"
import { useOpenTicketPage } from "./useOpenTicketPage"

type Related = Pick<TicketMenuTicket, "id" | "type" | "parent">

export function CreateRelatedSubmenu({
  ticket,
  canAttach
}: Readonly<{ ticket: Related; canAttach: boolean }>) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <SquarePlusCorner className="size-4" strokeWidth={1.75} />
        {m.tickets_menu_create_related()}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-w-72 min-w-48">
        <CreateRelatedItems ticket={ticket} canAttach={canAttach} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

function CreateRelatedItems({
  ticket,
  canAttach
}: Readonly<{ ticket: Related; canAttach: boolean }>) {
  const { orgSlug, slug } = useProjectRoute()
  const openPage = useOpenTicketPage(ticket.id)
  const openDialog = useAtomSet(createTicketDialog)
  const holdsChildren = canHoldChildren(ticket, ticket.parent)
  const create = (kind: RelatedKind) =>
    openDialog({
      orgSlug,
      projectSlug: slug,
      related: { kind, ticketId: ticket.id }
    })
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
