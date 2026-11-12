import { applyListEdit } from "@pp/shared"

import type { SelectedTicket } from "@/features/command-menu/lib/commandMenu"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"

type Single = "status" | "priority" | "type" | "estimate"

export type SharedTicketFields = Partial<Pick<SelectedTicket, Single>> &
  Pick<SelectedTicket, "tags" | "assignees"> &
  Readonly<{ parent?: never }>

const sameFor = <K extends Single>(
  tickets: ReadonlyArray<SelectedTicket>,
  key: K
): SelectedTicket[K] | undefined => {
  const [first, ...rest] = tickets
  if (first === undefined) return undefined
  const value = JSON.stringify(first[key])
  return rest.every((ticket) => JSON.stringify(ticket[key]) === value)
    ? first[key]
    : undefined
}

const commonTo = <A>(lists: ReadonlyArray<ReadonlyArray<A>>) => {
  const [first = [], ...rest] = lists
  return first.filter((value) => rest.every((list) => list.includes(value)))
}

export const sharedTicketFields = (
  tickets: ReadonlyArray<SelectedTicket>
): SharedTicketFields => ({
  status: sameFor(tickets, "status"),
  priority: sameFor(tickets, "priority"),
  type: sameFor(tickets, "type"),
  estimate: sameFor(tickets, "estimate"),
  tags: commonTo(tickets.map((ticket) => ticket.tags)),
  assignees: commonTo(tickets.map((ticket) => ticket.assignees))
})

export const applySelectedEdit = (
  ticket: SelectedTicket,
  edit: TicketEdit
): SelectedTicket => ({
  ...ticket,
  status: edit.status ?? ticket.status,
  priority: edit.priority ?? ticket.priority,
  type: edit.type ?? ticket.type,
  estimate: edit.estimate === undefined ? ticket.estimate : edit.estimate,
  tags:
    edit.tags === undefined
      ? ticket.tags
      : applyListEdit(ticket.tags, edit.tags),
  assignees:
    edit.assignees === undefined
      ? ticket.assignees
      : applyListEdit(ticket.assignees, edit.assignees)
})
