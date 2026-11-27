import type { InboxEntry, InboxEntryId } from "@pp/shared"

import { isDeleted } from "./entries"

export type SeenEntries = ReadonlyMap<InboxEntryId, InboxEntry>

export type ShownEntry = Readonly<{ entry: InboxEntry; resolved: boolean }>

export const rememberEntries = (
  seen: SeenEntries,
  latest: ReadonlyArray<InboxEntry>
) => {
  const next = new Map(seen)
  for (const entry of latest) next.set(entry.id, entry)
  return next
}

const newestFirst = (a: ShownEntry, b: ShownEntry) =>
  b.entry.latestAt.getTime() - a.entry.latestAt.getTime()

export const shownEntries = (
  seen: SeenEntries,
  latest: ReadonlyArray<InboxEntry>,
  selected: InboxEntryId | null
) => {
  const current = new Set(latest.map((entry) => entry.id))
  const kept = [...seen.values()].flatMap((entry) => {
    if (current.has(entry.id) || isDeleted(entry)) return []
    if (entry.kind === "mentioned")
      return entry.id === selected ? [{ entry, resolved: true }] : []
    return [
      {
        entry: { ...entry, state: "cleared" as const, eventCount: 0 },
        resolved: false
      }
    ]
  })
  return [
    ...latest
      .filter((entry) => !isDeleted(entry))
      .map((entry) => ({ entry, resolved: false })),
    ...kept
  ].toSorted(newestFirst) satisfies ReadonlyArray<ShownEntry>
}

const dayOf = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

export const groupByDay = <A extends ShownEntry>(
  entries: ReadonlyArray<A>,
  now: Date
) => {
  const today = dayOf(now)
  return {
    today: entries.filter((shown) => dayOf(shown.entry.latestAt) === today),
    earlier: entries.filter((shown) => dayOf(shown.entry.latestAt) !== today)
  }
}

export const stepEntry = (
  entries: ReadonlyArray<ShownEntry>,
  selected: InboxEntryId | null,
  step: 1 | -1
) => {
  if (entries.length === 0) return null
  const index = entries.findIndex((shown) => shown.entry.id === selected)
  if (index === -1) return entries[step === 1 ? 0 : entries.length - 1].entry
  const next = Math.min(Math.max(index + step, 0), entries.length - 1)
  return entries[next].entry
}
