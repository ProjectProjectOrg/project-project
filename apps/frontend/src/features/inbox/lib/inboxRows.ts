import type { InboxItem } from "@pp/shared"
import * as DateTime from "effect/DateTime"

export const inboxKey = (item: InboxItem): string =>
  `${item.projectSlug}/${item.ticket.id}`

const SAME_WRITE_MS = 1000

export const seenUntil = (item: InboxItem): Date =>
  item.lastReadAt ??
  DateTime.toDate(DateTime.makeUnsafe(item.firstAt.getTime() - SAME_WRITE_MS))

export const stepRow = (
  items: ReadonlyArray<InboxItem>,
  current: string | null,
  step: 1 | -1
): InboxItem | null => {
  const index = items.findIndex((item) => inboxKey(item) === current)
  if (index < 0) return items[0] ?? null
  return items[Math.min(Math.max(index + step, 0), items.length - 1)] ?? null
}

export const afterRemoving = (
  items: ReadonlyArray<InboxItem>,
  key: string
): InboxItem | null => {
  const index = items.findIndex((item) => inboxKey(item) === key)
  return index < 0 ? null : (items[index + 1] ?? items[index - 1] ?? null)
}
