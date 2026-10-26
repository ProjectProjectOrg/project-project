import { useAtom, useAtomValue } from "@effect/atom-react"
import type {
  ActivitySystemSource,
  TicketActivityActor,
  TicketId
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { Bot, GitBranch, Import, type LucideIcon } from "lucide-react"
import { useState } from "react"

import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import {
  olderActivityPages,
  ticketActivity,
  ticketActivityRequest
} from "@/features/tickets/atoms/ticketActivity"
import {
  ActivityLineView,
  type ActivityLookups
} from "@/features/tickets/components/TicketActivityLine"
import {
  activityItems,
  dayKey,
  groupActivity,
  type ActivityGroup
} from "@/features/tickets/lib/activityGroups"
import { activityLines } from "@/features/tickets/lib/activityLines"
import { formatRelative } from "@/lib/relativeTime"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

const INITIAL_VISIBLE = 12

const SYSTEM_ICONS: Readonly<Record<ActivitySystemSource, LucideIcon>> = {
  github: GitBranch,
  automation: Bot,
  import: Import
}

const SYSTEM_NAMES: Readonly<Record<ActivitySystemSource, () => string>> = {
  github: () => m.tickets_activity_actor_github(),
  automation: () => m.tickets_activity_actor_automation(),
  import: () => m.tickets_activity_actor_import()
}

function ActorMark({ actor }: Readonly<{ actor: TicketActivityActor | null }>) {
  if (actor !== null && actor.kind !== "system") {
    return <MemberAvatar member={actor.user} size={20} />
  }
  const Icon = actor === null ? null : SYSTEM_ICONS[actor.source]
  return (
    <span className="grid size-5 place-items-center rounded-full bg-muted text-muted-foreground">
      {Icon && <Icon className="size-3" strokeWidth={2} />}
    </span>
  )
}

function ActorName({ actor }: Readonly<{ actor: TicketActivityActor | null }>) {
  if (actor === null || actor.kind === "system") {
    return (
      <span className="font-medium text-foreground">
        {actor === null
          ? m.tickets_activity_actor_unknown()
          : SYSTEM_NAMES[actor.source]()}
      </span>
    )
  }
  const name = actor.user.name || actor.user.email
  if (actor.kind === "user") {
    return <span className="font-medium text-foreground">{name}</span>
  }
  return (
    <span className="font-medium text-foreground">
      {name}{" "}
      <span className="font-normal text-muted-foreground">
        {m.tickets_activity_actor_via({ client: actor.client.name })}
      </span>
    </span>
  )
}

const today = () => DateTime.toDate(DateTime.nowUnsafe())
const yesterday = () =>
  DateTime.toDate(DateTime.subtract(DateTime.nowUnsafe(), { days: 1 }))

const dayLabel = (day: Date): string => {
  const key = dayKey(day)
  if (key === dayKey(today())) return m.tickets_activity_today()
  if (key === dayKey(yesterday())) return m.tickets_activity_yesterday()
  return new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric",
    year: day.getFullYear() === today().getFullYear() ? undefined : "numeric"
  }).format(day)
}

const groupTime = (group: ActivityGroup): string =>
  dayKey(group.at) === dayKey(today())
    ? formatRelative(group.at)
    : new Intl.DateTimeFormat(getLocale(), {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      }).format(group.at)

const RAIL =
  "before:absolute before:left-[9.5px] before:w-px before:bg-border before:content-['']"

function GroupRow({
  group,
  lookups,
  railFromNode,
  railToNode
}: Readonly<{
  group: ActivityGroup
  lookups: ActivityLookups
  railFromNode: boolean
  railToNode: boolean
}>) {
  return (
    <li
      className={cn(
        "relative grid grid-cols-[20px_1fr] gap-x-3",
        RAIL,
        railFromNode ? "before:top-2.5" : "before:top-0",
        railToNode ? "before:h-2.5" : "pb-4 before:bottom-0"
      )}
    >
      <span className="relative z-10 grid h-5 place-items-center">
        <ActorMark actor={group.actor} />
      </span>
      <div className="flex items-center justify-between gap-3 text-sm leading-5">
        <ActorName actor={group.actor} />
        <time
          className="shrink-0 text-[13px] text-muted-foreground tabular-nums"
          dateTime={group.at.toISOString()}
          title={group.at.toLocaleString(getLocale(), {
            dateStyle: "medium",
            timeStyle: "short",
            hourCycle: "h23"
          })}
        >
          {groupTime(group)}
        </time>
      </div>
      <ul className="col-start-2 mt-1.5 flex flex-col gap-2">
        {activityItems(group.entries).flatMap((item) =>
          activityLines(item).map((line, index) => (
            <li
              key={`${item.key}-${index}`}
              className="text-sm leading-5 text-muted-foreground"
            >
              <ActivityLineView line={line} lookups={lookups} />
            </li>
          ))
        )}
      </ul>
    </li>
  )
}

export function TicketActivityFeed({
  ticketId
}: Readonly<{ ticketId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketActivityRequest(orgSlug, slug, ticketId)
  const result = useAtomValue(ticketActivity(req))
  const [olderPages, setOlderPages] = useAtom(olderActivityPages(req))
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, slug))
  )
  const tagsResult = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  const project = useProject()
  const [showAll, setShowAll] = useState(false)

  if (AsyncResult.isFailure(result)) {
    return (
      <p className="text-sm text-destructive">
        {m.tickets_activity_load_failed()}
      </p>
    )
  }
  if (!AsyncResult.isSuccess(result)) {
    return (
      <div aria-busy="true" className="space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  const lookups: ActivityLookups = {
    members: project.members,
    statuses: AsyncResult.isSuccess(statusesResult) ? statusesResult.value : [],
    tags: AsyncResult.isSuccess(tagsResult) ? tagsResult.value : []
  }
  const { items, hasOlder } = result.value
  const visible = showAll ? items : items.slice(0, INITIAL_VISIBLE)
  const canShowOlder = visible.length < items.length || hasOlder
  const days = groupActivity(visible)
  const lastGroup = days.at(-1)?.groups.at(-1)

  return (
    <div className="space-y-4">
      <ol>
        {days.flatMap((day, dayIndex) =>
          [
            <li
              key={day.key}
              className={cn(
                "relative pb-2.5 pl-8 text-[13px] leading-5 text-muted-foreground",
                dayIndex > 0 && cn("pt-3", RAIL, "before:inset-y-0")
              )}
            >
              {dayLabel(day.day)}
            </li>
          ].concat(
            day.groups.map((group, groupIndex) => (
              <GroupRow
                key={group.key}
                group={group}
                lookups={lookups}
                railFromNode={dayIndex === 0 && groupIndex === 0}
                railToNode={group === lastGroup}
              />
            ))
          )
        )}
      </ol>
      {canShowOlder && (
        <button
          type="button"
          disabled={result.waiting}
          onClick={() => {
            if (visible.length < items.length) setShowAll(true)
            else setOlderPages(olderPages + 1)
          }}
          className="ml-8 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-70"
        >
          {m.tickets_activity_show_older()}
        </button>
      )}
    </div>
  )
}
