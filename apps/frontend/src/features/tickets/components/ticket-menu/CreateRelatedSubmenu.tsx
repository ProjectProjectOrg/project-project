import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { canHoldChildren, type TicketDetail } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
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
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { SquarePlusCorner } from "@/features/tickets/components/ticket-marks/blockingIcon"
import { MARK_KINDS } from "@/features/tickets/components/ticket-marks/markKinds"
import { m } from "@/paraglide/messages"

import type { TicketMenuTicket } from "./TicketMenu"
import { useOpenTicketPage } from "./useOpenTicketPage"

type Related = Pick<TicketMenuTicket, "id" | "type" | "parent">

const noParent: Atom.Atom<Result.AsyncResult<TicketDetail, unknown>> =
  Atom.make(Result.initial())

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
      <DropdownMenuSubContent className="w-48">
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
  const holdsChildren = useHoldsChildren(ticket)
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
            {ticket.type === "epic"
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

function useHoldsChildren(ticket: Related): boolean {
  const { orgSlug, slug } = useProjectRoute()
  const parentId = ticket.type === "epic" ? null : (ticket.parent ?? null)
  const parent = useAtomValue(
    parentId === null
      ? noParent
      : ticketDetail(ticketRequest(orgSlug, slug, parentId))
  )
  if (parentId === null) return true
  return Result.isSuccess(parent) && canHoldChildren(ticket, parent.value)
}
