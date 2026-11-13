import type { TicketId, TicketSequenceEntry } from "@pp/shared"

export type StepCursor = Readonly<{
  shown: TicketId
  urls: ReadonlyArray<TicketId>
}>

export type StepDirection = -1 | 1

const URL_WINDOW_MS = 30_000
const URL_WINDOW_LIMIT = 90
const HELD_URL_INTERVAL_MS = 310
const WARM_AHEAD = 10
const WARM_BEHIND = 3

export function shownTicket(
  cursor: StepCursor | null,
  urlId: TicketId
): TicketId {
  return cursor !== null && cursor.urls.includes(urlId) ? cursor.shown : urlId
}

export function settledCursor(
  cursor: StepCursor | null,
  urlId: TicketId
): StepCursor | null {
  return cursor === null ||
    cursor.shown === urlId ||
    !cursor.urls.includes(urlId)
    ? null
    : cursor
}

export function stepCursor(
  cursor: StepCursor | null,
  urlId: TicketId,
  next: TicketId
): StepCursor {
  const urls =
    cursor !== null && cursor.urls.includes(urlId) && urlId !== cursor.shown
      ? cursor.urls
      : []
  return { shown: next, urls: [...new Set([...urls, urlId])] }
}

export function committedCursor(cursor: StepCursor): StepCursor {
  return { ...cursor, urls: [...new Set([...cursor.urls, cursor.shown])] }
}

export function stepTarget(
  tickets: ReadonlyArray<TicketSequenceEntry>,
  from: TicketId,
  direction: StepDirection
): TicketSequenceEntry | null {
  const index = tickets.findIndex((ticket) => ticket.id === from)
  if (index === -1) return null
  return tickets[index + direction] ?? null
}

export function urlCommitDelay(
  sent: ReadonlyArray<number>,
  now: number,
  held: boolean
): number {
  const recent = sent.filter((at) => now - at < URL_WINDOW_MS)
  if (recent.length >= URL_WINDOW_LIMIT) {
    return recent[recent.length - URL_WINDOW_LIMIT] + URL_WINDOW_MS - now
  }
  const last = recent.at(-1)
  if (!held || last === undefined) return 0
  return Math.max(0, last + HELD_URL_INTERVAL_MS - now)
}

export function warmWindow(
  tickets: ReadonlyArray<TicketSequenceEntry>,
  shown: TicketId,
  direction: StepDirection
): ReadonlyArray<TicketId> {
  const index = tickets.findIndex((ticket) => ticket.id === shown)
  if (index === -1) return []
  const ahead = direction === 1 ? WARM_AHEAD : WARM_BEHIND
  const behind = direction === 1 ? WARM_BEHIND : WARM_AHEAD
  return tickets
    .slice(Math.max(0, index - behind), index + ahead + 1)
    .map((ticket) => ticket.id)
}
