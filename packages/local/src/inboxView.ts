import type { InboxItem, SyncCursor } from "@pp/shared"

import type { InboxMark, InboxPosition } from "./inboxSource"
import type { LocalInboxRow } from "./inboxStore"

export type PendingMark = Readonly<{
  mark: InboxMark
  at: Date
  receipt: InboxPosition | null
}>

export const INBOX_LIMIT = 200

const positionOf = (cursor: SyncCursor): InboxPosition | null => {
  const [generation, sequence, ...rest] = cursor.split(".").map(Number)
  return rest.length === 0 &&
    generation !== undefined &&
    sequence !== undefined &&
    Number.isSafeInteger(generation) &&
    Number.isSafeInteger(sequence)
    ? { generation, sequence }
    : null
}

export const isSettled = (pending: PendingMark, cursor: SyncCursor | null) => {
  if (pending.receipt === null || cursor === null) return false
  const at = positionOf(cursor)
  return (
    at !== null &&
    (at.generation > pending.receipt.generation ||
      (at.generation === pending.receipt.generation &&
        at.sequence >= pending.receipt.sequence))
  )
}

const read = (item: InboxItem, at: Date): InboxItem => ({
  ...item,
  unread: false,
  unreadCount: 0,
  lastReadAt: at
})

const marked = (
  row: LocalInboxRow,
  { mark, at }: PendingMark,
  orgSlug: string
): LocalInboxRow => {
  if (mark.orgSlug !== orgSlug) return row
  if (!("ticketId" in mark)) {
    if (row.done || row.item.latestAt > at) return row
    if (mark.kind === "doneAll")
      return { ...row, done: true, item: read(row.item, at) }
    return row.item.unread ? { ...row, item: read(row.item, at) } : row
  }
  if (row.key !== `${mark.projectSlug}/${mark.ticketId}`) return row
  if (mark.kind === "read") return { ...row, item: read(row.item, at) }
  if (mark.kind === "done")
    return { ...row, done: true, item: read(row.item, at) }
  return {
    ...row,
    done: false,
    item: {
      ...row.item,
      unread: true,
      unreadCount: Math.max(row.item.unreadCount, 1)
    }
  }
}

export const withPending = (
  rows: ReadonlyArray<LocalInboxRow>,
  pending: ReadonlyArray<PendingMark>,
  orgSlug: string
) =>
  rows.map((row) =>
    pending.reduce((current, mark) => marked(current, mark, orgSlug), row)
  )

export const pendingKeys = (
  pending: ReadonlyArray<PendingMark>,
  orgSlug: string
) =>
  pending.flatMap(({ mark }) =>
    mark.orgSlug === orgSlug && "ticketId" in mark
      ? [`${mark.projectSlug}/${mark.ticketId}`]
      : []
  )

const isListed = (row: LocalInboxRow, readSince: Date) =>
  !row.done &&
  (row.item.unread ||
    row.item.direct.length > 0 ||
    (row.item.lastReadAt !== null && row.item.lastReadAt >= readSince))

const newestFirst = (a: LocalInboxRow, b: LocalInboxRow) =>
  b.item.latestAt.getTime() - a.item.latestAt.getTime() ||
  (b.key < a.key ? -1 : b.key > a.key ? 1 : 0)

export const inboxList = (
  rows: ReadonlyArray<LocalInboxRow>,
  readSince: Date
): ReadonlyArray<InboxItem> =>
  rows
    .filter((row) => isListed(row, readSince))
    .toSorted(newestFirst)
    .slice(0, INBOX_LIMIT)
    .map((row) => row.item)

export const unreadCount = (rows: ReadonlyArray<LocalInboxRow>) =>
  rows.filter((row) => !row.done && row.item.unread).length
