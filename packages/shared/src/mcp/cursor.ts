import { decodeCursor, type CursorPayload } from "./Pagination"

export const CURSOR_NUMERIC_WIDTH = 10

// Tickets and groups have ids like `T-7` / `G-42`. Sort lexically by a fixed-
// width zero-padded numeric string so `"0000000002"` < `"0000000010"`.
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
