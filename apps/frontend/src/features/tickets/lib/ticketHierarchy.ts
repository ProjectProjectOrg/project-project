import {
  isEpic,
  canHoldChildren,
  type Ticket,
  type TicketParent
} from "@pp/shared"

export type TicketHierarchy = Readonly<{
  subTicketOf: TicketParent | null
  holdsChildren: boolean
}>

export function ticketHierarchy(
  ticket: Pick<Ticket, "type" | "parent">
): TicketHierarchy {
  return {
    subTicketOf:
      ticket.parent !== null && !isEpic(ticket.parent) ? ticket.parent : null,
    holdsChildren: canHoldChildren(ticket, ticket.parent)
  }
}
