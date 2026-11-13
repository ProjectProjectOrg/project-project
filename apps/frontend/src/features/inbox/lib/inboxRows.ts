import type { InboxItem } from "@pp/shared"

export const inboxKey = (item: InboxItem): string =>
  `${item.projectSlug}/${item.ticket.id}`

export const readRow = (
  items: ReadonlyArray<InboxItem>,
  key: string,
  at: Date
): ReadonlyArray<InboxItem> =>
  items.map((item) =>
    inboxKey(item) === key
      ? { ...item, unread: false, unreadCount: 0, lastReadAt: at }
      : item
  )

export const unreadRow = (
  items: ReadonlyArray<InboxItem>,
  key: string
): ReadonlyArray<InboxItem> =>
  items.map((item) =>
    inboxKey(item) === key
      ? { ...item, unread: true, unreadCount: Math.max(item.unreadCount, 1) }
      : item
  )

export const withoutRow = (
  items: ReadonlyArray<InboxItem>,
  key: string
): ReadonlyArray<InboxItem> => items.filter((item) => inboxKey(item) !== key)

export const readAllRows = (
  items: ReadonlyArray<InboxItem>,
  at: Date
): ReadonlyArray<InboxItem> =>
  items.map((item) =>
    item.unread
      ? { ...item, unread: false, unreadCount: 0, lastReadAt: at }
      : item
  )

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
