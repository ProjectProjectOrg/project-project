import { decodeCursor, encodeCursor, type CursorPayload } from "./Pagination"

export const CURSOR_NUMERIC_WIDTH = 10

export const padNumericIdSort = (id: string): string | undefined => {
  const dash = id.indexOf("-")
  if (dash < 0) return undefined
  const tail = id.slice(dash + 1)
  if (!/^[0-9]+$/.test(tail)) return undefined
  return tail.padStart(CURSOR_NUMERIC_WIDTH, "0")
}

export const tryDecodeCursor = (
  cursor: string | undefined
): CursorPayload | undefined => {
  if (!cursor) return undefined
  try {
    return decodeCursor(cursor)
  } catch {
    return undefined
  }
}

export interface PaginateSortedOptions<A> {
  readonly cursor: CursorPayload | undefined
  readonly limit: number
  readonly sortKey: (item: A) => string
  readonly id: (item: A) => string
}

export const paginateSorted = <A>(
  sorted: ReadonlyArray<A>,
  opts: PaginateSortedOptions<A>
): { items: ReadonlyArray<A>; nextCursor: string | null } => {
  const startIdx =
    opts.cursor === undefined
      ? 0
      : (() => {
          const { sort, id } = opts.cursor
          const idx = sorted.findIndex((item) => {
            const s = opts.sortKey(item)
            if (s !== sort) return s > sort
            return opts.id(item) > id
          })
          return idx < 0 ? sorted.length : idx
        })()
  const slice = sorted.slice(startIdx, startIdx + opts.limit + 1)
  const hasMore = slice.length > opts.limit
  const items = hasMore ? slice.slice(0, opts.limit) : slice
  const last = items[items.length - 1]
  const nextCursor =
    hasMore && last
      ? encodeCursor({ id: opts.id(last), sort: opts.sortKey(last) })
      : null
  return { items, nextCursor }
}
