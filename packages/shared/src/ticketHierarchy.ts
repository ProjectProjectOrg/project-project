import type { TicketType } from "./schemas/Ticket"

type Typed = Readonly<{ type: TicketType }>

export const canHoldChildren = (
  ticket: Typed,
  parent: Typed | null | undefined
): boolean =>
  ticket.type === "epic" ||
  parent === null ||
  parent === undefined ||
  parent.type === "epic"
