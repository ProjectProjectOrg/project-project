import type { TicketActivityActor, TicketActivityEntry } from "@pp/shared"
import * as Schema from "effect/Schema"

import { activityItems, type ActivityItem } from "./activityGroups"
import { activityLines, type ActivityLine } from "./activityLines"

export type TimelineComment<C> = Readonly<{ key: string; at: Date; value: C }>

export type TimelineEvent<C> =
  | Readonly<{ kind: "activity"; at: Date; entry: TicketActivityEntry }>
  | Readonly<{ kind: "comment"; at: Date; comment: TimelineComment<C> }>

export type TimelineLine = Readonly<{
  key: string
  actor: TicketActivityActor | null
  at: Date
  line: ActivityLine
}>

export type TimelineRow<C> =
  | Readonly<{
      kind: "run"
      key: string
      lines: ReadonlyArray<TimelineLine>
      fold: number
    }>
  | Readonly<{ kind: "comment"; key: string; comment: TimelineComment<C> }>

export const TimelineOrder = Schema.Literals(["asc", "desc"])
export type TimelineOrder = typeof TimelineOrder.Type

export const FOLD_AT = 3
export const KEEP_OPEN = 2

export const timelineEvents = <C>({
  activity,
  comments,
  hasOlder
}: Readonly<{
  activity: ReadonlyArray<TicketActivityEntry>
  comments: ReadonlyArray<TimelineComment<C>>
  hasOlder: boolean
}>): ReadonlyArray<TimelineEvent<C>> => {
  const floor = hasOlder ? activity.at(-1)?.occurredAt.getTime() : undefined
  const events: ReadonlyArray<TimelineEvent<C>> = [
    ...activity.toReversed().map(
      (entry): TimelineEvent<C> => ({
        kind: "activity",
        at: entry.occurredAt,
        entry
      })
    ),
    ...comments
      .filter((comment) => floor === undefined || comment.at.getTime() >= floor)
      .map(
        (comment): TimelineEvent<C> => ({
          kind: "comment",
          at: comment.at,
          comment
        })
      )
  ]
  return events.toSorted((a, b) => a.at.getTime() - b.at.getTime())
}

const itemLines = (item: ActivityItem): ReadonlyArray<TimelineLine> =>
  activityLines(item).map((line, index) => ({
    key: `${item.key}:${index}`,
    actor: item.kind === "entry" ? item.entry.actor : item.actor,
    at: item.kind === "entry" ? item.entry.occurredAt : item.at,
    line
  }))

export const timelineRows = <C>(
  events: ReadonlyArray<TimelineEvent<C>>,
  order: TimelineOrder
): ReadonlyArray<TimelineRow<C>> => {
  const rows: Array<TimelineRow<C>> = []
  let run: Array<TicketActivityEntry> = []
  const flush = () => {
    const lines = activityItems(run).flatMap(itemLines)
    const first = lines[0]
    if (first !== undefined) {
      rows.push({
        kind: "run",
        key: first.key,
        lines,
        fold: lines.length >= FOLD_AT ? lines.length : 0
      })
    }
    run = []
  }
  for (const event of events) {
    if (event.kind === "activity") {
      run.push(event.entry)
      continue
    }
    flush()
    rows.push({
      kind: "comment",
      key: event.comment.key,
      comment: event.comment
    })
  }
  flush()
  const newest = rows.findLastIndex((row) => row.kind === "run")
  const last = rows[newest]
  if (last?.kind === "run") {
    const older = last.lines.length - KEEP_OPEN
    rows[newest] = { ...last, fold: older >= FOLD_AT ? older : 0 }
  }
  return order === "asc" ? rows : rows.toReversed()
}
