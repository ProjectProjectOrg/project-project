import type { ActivityActorShape, TicketActivityChange } from "@pp/shared"

import type { StoredTicketActivity } from "./TicketActivity"

export const DESCRIPTION_EDIT_WINDOW_MS = 10 * 60 * 1000
export const VALUE_CHANGE_WINDOW_MS = 60 * 1000

type ValueChange = Extract<
  TicketActivityChange,
  Readonly<{ from: unknown; to: unknown }>
>

const isValueChange = (change: TicketActivityChange): change is ValueChange =>
  "from" in change && "to" in change

const actorKey = (actor: ActivityActorShape): string => {
  if (actor.kind === "system") return `system:${actor.source}`
  if (actor.kind === "agent") return `agent:${actor.userId}:${actor.clientId}`
  return `user:${actor.userId}`
}

const windowFor = (change: TicketActivityChange): number | null => {
  if (change.kind === "description_edited") return DESCRIPTION_EDIT_WINDOW_MS
  if (isValueChange(change)) return VALUE_CHANGE_WINDOW_MS
  return null
}

const startingFrom = (
  newer: TicketActivityChange,
  older: TicketActivityChange
): TicketActivityChange => {
  if (newer.kind === "title_changed" && older.kind === "title_changed") {
    return { ...newer, from: older.from }
  }
  if (newer.kind === "status_changed" && older.kind === "status_changed") {
    return { ...newer, from: older.from }
  }
  if (newer.kind === "priority_changed" && older.kind === "priority_changed") {
    return { ...newer, from: older.from }
  }
  if (newer.kind === "type_changed" && older.kind === "type_changed") {
    return { ...newer, from: older.from }
  }
  return newer
}

type Run = {
  entry: StoredTicketActivity
  oldestAt: number
}

export const coalesceActivity = (
  newestFirst: ReadonlyArray<StoredTicketActivity>
): ReadonlyArray<StoredTicketActivity> => {
  const output: Array<Run> = []
  const openRuns = new Map<string, Run>()
  const latestKeyOfKind = new Map<string, string>()
  for (const entry of newestFirst) {
    const window = windowFor(entry.change)
    const at = entry.occurredAt.getTime()
    if (window === null) {
      output.push({ entry, oldestAt: at })
      continue
    }
    const key = `${actorKey(entry.actor)}|${entry.cause ?? ""}|${entry.change.kind}`
    const interrupted = latestKeyOfKind.get(entry.change.kind)
    if (interrupted !== undefined && interrupted !== key) {
      openRuns.delete(interrupted)
    }
    latestKeyOfKind.set(entry.change.kind, key)
    const run = openRuns.get(key)
    if (run !== undefined && run.oldestAt - at <= window) {
      run.oldestAt = at
      run.entry = {
        ...run.entry,
        change: startingFrom(run.entry.change, entry.change)
      }
      continue
    }
    const next: Run = { entry, oldestAt: at }
    openRuns.set(key, next)
    output.push(next)
  }
  return output
    .map((run) => run.entry)
    .filter(
      (entry) =>
        !isValueChange(entry.change) || entry.change.from !== entry.change.to
    )
}
