import type { InboxEntry, InboxEntryId, InboxEntryStatus } from "@pp/shared"

export type InboxEntries = ReadonlyArray<InboxEntry>

const update = (
  entries: InboxEntries,
  id: InboxEntryId,
  change: (entry: InboxEntry) => InboxEntry
) => entries.map((entry) => (entry.id === id ? change(entry) : entry))

export const readEntry = (entry: InboxEntry) =>
  entry.state === "cleared"
    ? entry
    : entry.kind === "mentioned"
      ? ({ ...entry, state: "read", eventCount: 0 } satisfies InboxEntry)
      : ({
          ...entry,
          state: "cleared",
          clearedBy: "read",
          eventCount: 0
        } satisfies InboxEntry)

export const unreadEntry = (entry: InboxEntry) =>
  entry.state === "unread"
    ? entry
    : ({
        ...entry,
        state: "unread",
        clearedBy: null,
        eventCount: Math.max(entry.eventCount, 1)
      } satisfies InboxEntry)

export const markEntryRead = (entries: InboxEntries, id: InboxEntryId) =>
  update(entries, id, readEntry)

const withEntry = (entries: InboxEntries, entry: InboxEntry) =>
  entries.some((item) => item.id === entry.id)
    ? entries
    : [...entries, entry].toSorted(
        (a, b) => b.latestAt.getTime() - a.latestAt.getTime()
      )

export const markEntryUnread = (entries: InboxEntries, entry: InboxEntry) =>
  update(withEntry(entries, entry), entry.id, unreadEntry)

export const deleteEntry = (entries: InboxEntries, entry: InboxEntry) =>
  update(withEntry(entries, entry), entry.id, (item) =>
    item.state === "cleared" && item.clearedBy === "deleted"
      ? item
      : ({
          ...item,
          state: "cleared",
          clearedBy: "deleted",
          eventCount: 0
        } satisfies InboxEntry)
  )

export const isDeleted = (entry: InboxEntry) =>
  entry.state === "cleared" && entry.clearedBy === "deleted"

export const withStatus = (entries: InboxEntries, status: InboxEntryStatus) =>
  update(entries, status.id, (entry) =>
    entry.revision > status.revision
      ? entry
      : {
          ...entry,
          state: status.state,
          clearedBy: status.clearedBy,
          revision: status.revision
        }
  )

export const markAllEntriesRead = (entries: InboxEntries, upTo: Date) =>
  entries.map((entry) =>
    entry.state === "unread" && entry.latestAt.getTime() <= upTo.getTime()
      ? readEntry(entry)
      : entry
  )

export const unreadCount = (entries: InboxEntries) =>
  entries.filter((entry) => entry.state === "unread").length
