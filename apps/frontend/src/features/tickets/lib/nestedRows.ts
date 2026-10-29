import { hasSubTickets, type Ticket, type TicketId } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import type { TicketRow } from "./ticketRows"

export type NestedEntry =
  | Readonly<{
      kind: "row"
      key: string
      row: TicketRow
      parent: TicketId | null
      last: boolean
    }>
  | Readonly<{
      kind: "children"
      key: string
      parent: TicketId
      state: "loading" | "failed"
    }>

export type ChildRowsResult = AsyncResult.AsyncResult<
  ReadonlyArray<TicketRow>,
  unknown
>

const childrenEntries = (
  parent: TicketId,
  children: ChildRowsResult | undefined
): ReadonlyArray<NestedEntry> => {
  if (children === undefined || AsyncResult.isInitial(children)) {
    return [{ kind: "children", key: `${parent}/…`, parent, state: "loading" }]
  }
  if (AsyncResult.isFailure(children)) {
    return [{ kind: "children", key: `${parent}/…`, parent, state: "failed" }]
  }
  return children.value.map((child, index) => ({
    kind: "row",
    key: `${parent}/${child.key}`,
    row: child,
    parent,
    last: index === children.value.length - 1
  }))
}

export const expandedParents = (
  rows: ReadonlyArray<TicketRow>,
  isExpanded: (id: TicketId) => boolean
): ReadonlySet<TicketId> =>
  new Set(
    rows.flatMap(({ ticket }) =>
      hasSubTickets(ticket) && isExpanded(ticket.id) ? [ticket.id] : []
    )
  )

export const childrenSettled = (
  children: ReadonlyMap<TicketId, ChildRowsResult>
): boolean =>
  [...children.values()].every((result) => !AsyncResult.isInitial(result))

export const withExpandedChildren = (
  rows: ReadonlyArray<TicketRow>,
  expanded: ReadonlySet<TicketId>,
  childrenOf: (parent: TicketId) => ChildRowsResult | undefined
): ReadonlyArray<NestedEntry> =>
  rows.flatMap(
    (row): ReadonlyArray<NestedEntry> => [
      { kind: "row", key: row.key, row, parent: null, last: false },
      ...(expanded.has(row.ticket.id)
        ? childrenEntries(row.ticket.id, childrenOf(row.ticket.id))
        : [])
    ]
  )

export const withoutNestedChildren = <
  T extends Pick<Ticket, "id" | "parent" | "type">
>(
  tickets: ReadonlyArray<T>
): ReadonlyArray<T> => {
  const typeOf = new Map(tickets.map(({ id, type }) => [id, type]))
  return tickets.filter(({ parent }) => {
    const parentType =
      parent === undefined || parent === null ? undefined : typeOf.get(parent)
    return parentType === undefined || parentType === "epic"
  })
}
