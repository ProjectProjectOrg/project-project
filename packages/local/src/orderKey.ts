import {
  estimateRank,
  padNumericIdSort,
  type Ticket,
  TicketPriority,
  type TicketSort
} from "@pp/shared"

export type Orderable = Readonly<{
  id: string
  rank: string
  createdAt: Date
  updatedAt: Date
  title: string
  priority: Ticket["priority"]
  estimate: Ticket["estimate"]
}>

export const localOrderKey = (ticket: Orderable, sort: TicketSort): string => {
  let value: string
  switch (sort.key) {
    case "manual":
      value = ticket.rank
      break
    case "id":
      value = padNumericIdSort(ticket.id) ?? ticket.id
      break
    case "created":
      value = ticket.createdAt.toISOString()
      break
    case "updated":
      value = ticket.updatedAt.toISOString()
      break
    case "title":
      value = ticket.title.toLowerCase()
      break
    case "priority":
      value = String(
        TicketPriority.literals.indexOf(ticket.priority) + 1
      ).padStart(2, "0")
      break
    case "estimate":
      value = String(
        ticket.estimate === null ? 0 : estimateRank(ticket.estimate)
      ).padStart(6, "0")
      break
  }
  return `${value}\u0000${ticket.id}`
}

const ORDER_SEPARATOR = "\u0000"
const STORED_SEPARATOR = "\u0001"

export const storedOrderKey = (key: string) =>
  key.replace(ORDER_SEPARATOR, STORED_SEPARATOR)

export const readOrderKey = (stored: string) =>
  stored.replace(STORED_SEPARATOR, ORDER_SEPARATOR)
