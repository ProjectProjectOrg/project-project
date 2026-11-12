import type { Ticket, TicketType } from "./Ticket"

type Typed = Readonly<{ type?: string | null }> | null | undefined

export const EPIC_TYPE = "epic" satisfies TicketType

export const isEpicType = (
  type: string | null | undefined
): type is typeof EPIC_TYPE => type === EPIC_TYPE

export const isEpic = <T extends Typed>(
  ticket: T
): ticket is T & Readonly<{ type: typeof EPIC_TYPE }> =>
  isEpicType(ticket?.type)

export const canHaveParent = (type: string | null | undefined): boolean =>
  !isEpicType(type)

export const canJoinSprint = (type: string | null | undefined): boolean =>
  !isEpicType(type)

export const canHoldChildren = (ticket: Typed, parent: Typed): boolean =>
  isEpic(ticket) || parent === null || parent === undefined || isEpic(parent)

export const hasSubTickets = (
  ticket: Pick<Ticket, "subTicketCount">
): boolean => (ticket.subTicketCount ?? 0) > 0
