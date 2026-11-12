import { isEpicType } from "@pp/shared"
import type { Ticket } from "@pp/shared"

export const withoutNestedChildren = <
  T extends Pick<Ticket, "id" | "parent" | "type">
>(
  tickets: ReadonlyArray<T>
): ReadonlyArray<T> => {
  const typeOf = new Map(tickets.map(({ id, type }) => [id, type]))
  return tickets.filter(({ parent }) => {
    const parentType = parent === null ? undefined : typeOf.get(parent.id)
    return parentType === undefined || isEpicType(parentType)
  })
}
