import type { TicketActivityActor, TicketActivityEntry } from "@pp/shared"

import { activityItems, type ActivityItem } from "./activityGroups"

export type TimelineComment<C> = Readonly<{ key: string; at: Date; value: C }>

export type TimelineEvent<C> =
  | Readonly<{ kind: "activity"; at: Date; entry: TicketActivityEntry }>
  | Readonly<{ kind: "comment"; at: Date; comment: TimelineComment<C> }>

export type TimelineRow<C> =
  | Readonly<{
      kind: "activity"
      key: string
      item: ActivityItem
      actor: TicketActivityActor | null
      at: Date
      first: boolean
      last: boolean
    }>
  | Readonly<{ kind: "comment"; key: string; comment: TimelineComment<C> }>

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

const actorOf = (item: ActivityItem) =>
  item.kind === "entry" ? item.entry.actor : item.actor

const atOf = (item: ActivityItem) =>
  item.kind === "entry" ? item.entry.occurredAt : item.at

export const timelineRows = <C>(
  events: ReadonlyArray<TimelineEvent<C>>
): ReadonlyArray<TimelineRow<C>> => {
  const rows: Array<TimelineRow<C>> = []
  let run: Array<TicketActivityEntry> = []
  const flush = () => {
    const items = activityItems(run)
    items.forEach((item, index) =>
      rows.push({
        kind: "activity",
        key: item.key,
        item,
        actor: actorOf(item),
        at: atOf(item),
        first: index === 0,
        last: index === items.length - 1
      })
    )
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
  return rows
}
