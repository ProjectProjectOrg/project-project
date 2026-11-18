import type { TicketActivityActor, TicketActivityEntry } from "@pp/shared"
import * as Data from "effect/Data"
import * as Schema from "effect/Schema"

import { activityItems, ActivityItem } from "./activityGroups"
import { activityLines, type ActivityLine } from "./activityLines"

export type TimelineComment<C> = Readonly<{
  key: string
  at: Date
  lastAt: Date
  value: C
}>

export type TimelineEvent<C> = Data.TaggedEnum<{
  activity: { readonly at: Date; readonly entry: TicketActivityEntry }
  comment: { readonly at: Date; readonly comment: TimelineComment<C> }
}>
interface TimelineEventDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: TimelineEvent<this["A"]>
}
export const TimelineEvent = Data.taggedEnum<TimelineEventDefinition>()

export type TimelineLine = Readonly<{
  key: string
  actor: TicketActivityActor | null
  at: Date
  line: ActivityLine
}>

export type TimelineRow<C> = Data.TaggedEnum<{
  run: {
    readonly key: string
    readonly lines: ReadonlyArray<TimelineLine>
    readonly fold: number
  }
  comment: { readonly key: string; readonly comment: TimelineComment<C> }
}>
interface TimelineRowDefinition extends Data.TaggedEnum.WithGenerics<1> {
  readonly taggedEnum: TimelineRow<this["A"]>
}
export const TimelineRow = Data.taggedEnum<TimelineRowDefinition>()

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
}>) => {
  const floor = hasOlder ? activity.at(-1)?.occurredAt.getTime() : undefined
  const events: ReadonlyArray<TimelineEvent<C>> = [
    ...activity
      .toReversed()
      .map((entry) => TimelineEvent.activity({ at: entry.occurredAt, entry })),
    ...comments
      .filter(
        (comment) => floor === undefined || comment.lastAt.getTime() >= floor
      )
      .map((comment) => TimelineEvent.comment({ at: comment.at, comment }))
  ]
  return events.toSorted((a, b) => a.at.getTime() - b.at.getTime())
}

const itemLines = (item: ActivityItem) =>
  activityLines(item).map((line, index) => ({
    key: `${item.key}:${index}`,
    actor: ActivityItem.$is("entry")(item) ? item.entry.actor : item.actor,
    at: ActivityItem.$is("entry")(item) ? item.entry.occurredAt : item.at,
    line
  }))

export const timelineRows = <C>(
  events: ReadonlyArray<TimelineEvent<C>>,
  order: TimelineOrder
) => {
  const rows: Array<TimelineRow<C>> = []
  let run: Array<TicketActivityEntry> = []
  const flush = () => {
    const lines = activityItems(run).flatMap(itemLines)
    const first = lines[0]
    if (first !== undefined) {
      rows.push(
        TimelineRow.run({
          key: first.key,
          lines,
          fold: lines.length >= FOLD_AT ? lines.length : 0
        })
      )
    }
    run = []
  }
  for (const event of events) {
    if (TimelineEvent.$is("activity")(event)) {
      run.push(event.entry)
      continue
    }
    flush()
    rows.push(
      TimelineRow.comment({ key: event.comment.key, comment: event.comment })
    )
  }
  flush()
  const newest = rows.findLastIndex(TimelineRow.$is("run"))
  const last = rows[newest]
  if (last !== undefined && TimelineRow.$is("run")(last)) {
    const older = last.lines.length - KEEP_OPEN
    rows[newest] = { ...last, fold: older >= FOLD_AT ? older : 0 }
  }
  return order === "asc" ? rows : rows.toReversed()
}
