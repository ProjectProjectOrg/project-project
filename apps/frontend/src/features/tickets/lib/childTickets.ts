import type { Ticket } from "@pp/shared"

type Parent = Pick<Ticket, "id" | "type">

export const attachCandidates = (
  tickets: ReadonlyArray<Ticket>,
  parent: Parent
): ReadonlyArray<Ticket> =>
  tickets.filter(
    (ticket) =>
      ticket.type !== "epic" &&
      ticket.id !== parent.id &&
      ticket.parent !== parent.id &&
      (parent.type === "epic" || (ticket.subTicketCount ?? 0) === 0)
  )
