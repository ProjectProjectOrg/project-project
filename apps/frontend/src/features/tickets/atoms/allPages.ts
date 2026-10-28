import type { TicketListPage, TicketListRow } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"

export const allPages = <E>(
  get: Atom.AtomContext,
  page: (
    cursor: string | undefined
  ) => Atom.Atom<AsyncResult.AsyncResult<TicketListPage, E>>
): AsyncResult.AsyncResult<ReadonlyArray<TicketListRow>, E> => {
  const rows: Array<TicketListRow> = []
  let cursor: string | undefined = undefined
  let waiting = false
  do {
    const result: AsyncResult.AsyncResult<TicketListPage, E> = get(page(cursor))
    if (!AsyncResult.isSuccess(result)) {
      return AsyncResult.map(result, (): ReadonlyArray<TicketListRow> => rows)
    }
    rows.push(...result.value.items)
    waiting ||= result.waiting
    cursor = result.value.nextCursor ?? undefined
  } while (cursor !== undefined)
  return AsyncResult.success(rows, { waiting })
}
