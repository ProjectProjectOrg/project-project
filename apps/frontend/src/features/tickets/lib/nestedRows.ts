import type { Ticket, TicketId } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"

import type { TicketRow } from "./ticketRows"

export type NestedEntry =
  | Readonly<{
      kind: "row"
      key: string
      row: TicketRow
      parent: TicketId | null
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
  return children.value.map((child) => ({
    kind: "row",
    key: `${parent}/${child.key}`,
    row: child,
    parent
  }))
}

export const withExpandedChildren = (
  rows: ReadonlyArray<TicketRow>,
  expanded: ReadonlySet<TicketId>,
  childrenOf: (parent: TicketId) => ChildRowsResult | undefined
): ReadonlyArray<NestedEntry> =>
  rows.flatMap(
    (row): ReadonlyArray<NestedEntry> => [
      { kind: "row", key: row.key, row, parent: null },
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
    const parentType = parent == null ? undefined : typeOf.get(parent)
    return parentType === undefined || parentType === "epic"
  })
}
