import type { BulkDeleteTicketsInput, Ticket, TicketCounts } from "@pp/shared"
import * as Arr from "effect/Array"

import type { TicketRowPage } from "./ticketRows"

export const deletedTicketIds = (
  tickets: ReadonlyArray<Ticket>,
  input: BulkDeleteTicketsInput
) => {
  const ids = new Set(input.tickets)
  if (!input.cascadeSubTickets) return ids
  const children = Arr.groupBy(tickets, (ticket) => ticket.parent?.id ?? "")
  for (const id of ids) {
    for (const child of children[id] ?? []) ids.add(child.id)
  }
  return ids
}

export const subtractDeletedCounts = (
  counts: TicketCounts,
  tickets: ReadonlyArray<Ticket>
) => {
  const byStatus = { ...counts.byStatus }
  for (const { status } of tickets) {
    byStatus[status] = Math.max(0, (byStatus[status] ?? 0) - 1)
  }
  return { total: Math.max(0, counts.total - tickets.length), byStatus }
}

type CountedSection = Readonly<{ count: number; page: TicketRowPage }>

export const removeFromSections = <S extends CountedSection>(
  value: Readonly<{
    sections: ReadonlyArray<S>
    total: number
    counts: TicketCounts
  }>,
  input: BulkDeleteTicketsInput,
  adjust?: (section: S, removed: ReadonlyArray<Ticket>) => S
) => {
  const ids = deletedTicketIds(
    value.sections.flatMap((section) =>
      section.page.items.map((row) => row.ticket)
    ),
    input
  )
  const removed: Array<Ticket> = []
  const sections = value.sections.map((section) => {
    const deleted = section.page.items
      .filter((row) => ids.has(row.ticket.id))
      .map((row) => row.ticket)
    if (deleted.length === 0) return section
    removed.push(...deleted)
    const next = {
      ...section,
      count: Math.max(0, section.count - deleted.length),
      page: {
        ...section.page,
        items: section.page.items.filter((row) => !ids.has(row.ticket.id))
      }
    }
    return adjust ? adjust(next, deleted) : next
  })
  return {
    sections,
    total: Math.max(0, value.total - removed.length),
    counts: subtractDeletedCounts(value.counts, removed)
  }
}
