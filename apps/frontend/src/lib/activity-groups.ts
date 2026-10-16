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

type GroupDraft = Readonly<{
  group: ActivityGroup
  actorKey: string
  dayKey: string
  oldest: number
}>

const draftGroups = (
  newestFirst: ReadonlyArray<TicketActivityEntry>
): ReadonlyArray<GroupDraft> => {
  const drafts: Array<GroupDraft> = []
  for (const entry of newestFirst) {
    const last = drafts.at(-1)
    const who = actorKey(entry.actor)
    const day = dayKey(entry.occurredAt)
    const at = entry.occurredAt.getTime()
    if (
      last !== undefined &&
      last.dayKey === day &&
      last.actorKey === who &&
      last.oldest - at <= ACTIVITY_GROUP_WINDOW_MS
    ) {
      drafts[drafts.length - 1] = {
        ...last,
        oldest: at,
        group: { ...last.group, entries: [...last.group.entries, entry] }
      }
      continue
    }
    drafts.push({
      actorKey: who,
      dayKey: day,
      oldest: at,
      group: {
        key: entry.id,
        actor: entry.actor,
        at: entry.occurredAt,
        entries: [entry]
      }
    })
  }
  return drafts
}

export const groupActivity = (
  newestFirst: ReadonlyArray<TicketActivityEntry>
): ReadonlyArray<ActivityDay> => {
  const days: Array<ActivityDay> = []
  for (const draft of draftGroups(newestFirst)) {
    const last = days.at(-1)
    if (last !== undefined && last.key === draft.dayKey) {
      days[days.length - 1] = {
        ...last,
        groups: [...last.groups, draft.group]
      }
      continue
    }
    days.push({ key: draft.dayKey, day: draft.group.at, groups: [draft.group] })
  }
  return days
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
