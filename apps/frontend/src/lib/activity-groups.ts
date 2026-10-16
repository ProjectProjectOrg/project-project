import type { TicketActivityActor, TicketActivityEntry } from "@pp/shared"

export const ACTIVITY_GROUP_WINDOW_MS = 30 * 60 * 1000

export type ActivityGroup = Readonly<{
  key: string
  actor: TicketActivityActor | null
  at: Date
  entries: ReadonlyArray<TicketActivityEntry>
}>

export type ActivityDay = Readonly<{
  key: string
  day: Date
  groups: ReadonlyArray<ActivityGroup>
}>

const actorKey = (actor: TicketActivityActor | null): string => {
  if (actor === null) return "unknown"
  if (actor.kind === "system") return `system:${actor.source}`
  if (actor.kind === "agent") return `agent:${actor.user.id}:${actor.client.id}`
  return `user:${actor.user.id}`
}

export const dayKey = (date: Date): string =>
  `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`

type OpenGroup = {
  key: string
  actorKey: string
  actor: TicketActivityActor | null
  at: Date
  oldest: number
  entries: Array<TicketActivityEntry>
}

export const groupActivity = (
  newestFirst: ReadonlyArray<TicketActivityEntry>
): ReadonlyArray<ActivityDay> => {
  const days: Array<{ key: string; day: Date; groups: Array<OpenGroup> }> = []
  for (const entry of newestFirst) {
    const key = dayKey(entry.occurredAt)
    let day = days.at(-1)
    if (day === undefined || day.key !== key) {
      day = { key, day: entry.occurredAt, groups: [] }
      days.push(day)
    }
    const who = actorKey(entry.actor)
    const at = entry.occurredAt.getTime()
    const group = day.groups.at(-1)
    if (
      group !== undefined &&
      group.actorKey === who &&
      group.oldest - at <= ACTIVITY_GROUP_WINDOW_MS
    ) {
      group.entries.push(entry)
      group.oldest = at
      continue
    }
    day.groups.push({
      key: entry.id,
      actorKey: who,
      actor: entry.actor,
      at: entry.occurredAt,
      oldest: at,
      entries: [entry]
    })
  }
  return days.map((day) => ({
    key: day.key,
    day: day.day,
    groups: day.groups.map(({ key, actor, at, entries }) => ({
      key,
      actor,
      at,
      entries
    }))
  }))
}
