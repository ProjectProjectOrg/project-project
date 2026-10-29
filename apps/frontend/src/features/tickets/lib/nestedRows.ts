import type { Ticket, TicketId } from "@pp/shared"
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
      last: boolean
    }>

export type ChildRowsResult = AsyncResult.AsyncResult<
  ReadonlyArray<TicketRow>,
  unknown
>

const childrenEntries = (
  parent: Pick<Ticket, "id" | "subTicketCount">,
  children: ChildRowsResult | undefined
): ReadonlyArray<NestedEntry> => {
  if (children === undefined || AsyncResult.isInitial(children)) {
    const count = Math.max(1, parent.subTicketCount ?? 0)
    return Array.from({ length: count }, (_, index) => ({
      kind: "children",
      key: `${parent.id}/…${index}`,
      parent: parent.id,
      state: "loading",
      last: index === count - 1
    }))
  }
  if (AsyncResult.isFailure(children)) {
    return [
      {
        kind: "children",
        key: `${parent.id}/…0`,
        parent: parent.id,
        state: "failed",
        last: true
      }
    ]
  }
  return children.value.map((child, index) => ({
    kind: "row",
    key: `${parent.id}/${child.key}`,
    row: child,
    parent: parent.id,
    last: index === children.value.length - 1
  }))
}

export const withExpandedChildren = (
  rows: ReadonlyArray<TicketRow>,
  expanded: ReadonlySet<TicketId>,
  childrenOf: (parent: TicketId) => ChildRowsResult | undefined
): ReadonlyArray<NestedEntry> =>
  rows.flatMap(
    (row): ReadonlyArray<NestedEntry> => [
      { kind: "row", key: row.key, row, parent: null, last: false },
      ...(expanded.has(row.ticket.id)
        ? childrenEntries(row.ticket, childrenOf(row.ticket.id))
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
