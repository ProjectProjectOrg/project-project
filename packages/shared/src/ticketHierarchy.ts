import type { Ticket, TicketType } from "./schemas/Ticket"

type Typed = Readonly<{ type: TicketType }>

export const canHoldChildren = (
  ticket: Typed,
  parent: Typed | null | undefined
): boolean =>
  ticket.type === "epic" ||
  parent === null ||
  parent === undefined ||
  parent.type === "epic"

export const hasSubTickets = (
  ticket: Pick<Ticket, "subTicketCount">
): boolean => (ticket.subTicketCount ?? 0) > 0
