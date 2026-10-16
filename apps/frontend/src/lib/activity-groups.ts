import type {
  ActivityCause,
  TicketActivityActor,
  TicketActivityEntry
} from "@pp/shared"

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

export const SPRINT_MOVE_WINDOW_MS = 10 * 1000

export type ActivityItem =
  | Readonly<{ kind: "entry"; key: string; entry: TicketActivityEntry }>
  | Readonly<{
      kind: "sprint_moved"
      key: string
      from: string
      to: string
      cause: ActivityCause | null
    }>

type SprintMembership = Readonly<{
  entry: Extract<TicketActivityEntry, { kind: "change" }>
  direction: "added" | "removed"
  name: string
}>

const sprintMembership = (
  entry: TicketActivityEntry
): SprintMembership | null => {
  if (entry.kind !== "change") return null
  const { change } = entry
  if (change.kind !== "group_added" && change.kind !== "group_removed") {
    return null
  }
  if (change.groupKind !== "sprint") return null
  return {
    entry,
    direction: change.kind === "group_added" ? "added" : "removed",
    name: change.name
  }
}

const pairs = (a: SprintMembership, b: SprintMembership): boolean =>
  a.direction !== b.direction &&
  a.entry.cause === b.entry.cause &&
  Math.abs(a.entry.occurredAt.getTime() - b.entry.occurredAt.getTime()) <=
    SPRINT_MOVE_WINDOW_MS

export const activityItems = (
  entries: ReadonlyArray<TicketActivityEntry>
): ReadonlyArray<ActivityItem> => {
  const merged = new Set<string>()
  const items: Array<ActivityItem> = []
  for (const entry of entries) {
    if (merged.has(entry.id)) continue
    const own = sprintMembership(entry)
    const partner =
      own === null
        ? undefined
        : entries
            .filter((other) => other.id !== entry.id && !merged.has(other.id))
            .map(sprintMembership)
            .find(
              (other): other is SprintMembership =>
                other !== null && pairs(own, other)
            )
    if (own === null || partner === undefined) {
      items.push({ kind: "entry", key: entry.id, entry })
      continue
    }
    merged.add(partner.entry.id)
    const [removed, added] =
      own.direction === "removed" ? [own, partner] : [partner, own]
    items.push({
      kind: "sprint_moved",
      key: `${removed.entry.id}:${added.entry.id}`,
      from: removed.name,
      to: added.name,
      cause: own.entry.cause
    })
  }
  return items
}
