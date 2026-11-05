import { useAtom, useAtomValue } from "@effect/atom-react"
import type {
  ActivitySystemSource,
  TicketActivityActor,
  TicketId
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { Bot, GitBranch, Import, type LucideIcon } from "lucide-react"
import { useState, type ReactNode } from "react"

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
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import {
  activityLines,
  type ActivityLine
} from "@/features/tickets/lib/activityLines"
import {
  timelineEvents,
  timelineRows,
  type TimelineComment
} from "@/features/tickets/lib/timeline"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

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
      <span className="font-medium">
        {actor === null
          ? m.tickets_activity_actor_unknown()
          : SYSTEM_NAMES[actor.source]()}
      </span>
    )
  }
  const name = actor.user.name || actor.user.email
  if (actor.kind === "user") {
    return <span className="font-medium">{name}</span>
  }
  return (
    <span className="font-medium">
      {name}{" "}
      <span className="font-normal text-muted-foreground">
        {m.tickets_activity_actor_via({ client: actor.client.name })}
      </span>
    </span>
  )
}

const RAIL =
  "before:absolute before:left-[calc(var(--ticket-box-offset)+9.5px)] before:w-px before:bg-border before:content-['']"

function EventRow({
  actor,
  at,
  line,
  lookups,
  first,
  last
}: Readonly<{
  actor: TicketActivityActor | null
  at: Date
  line: ActivityLine
  lookups: ActivityLookups
  first: boolean
  last: boolean
}>) {
  return (
    <li
      className={cn(
        "relative grid grid-cols-[20px_1fr] gap-x-2 py-2 pl-(--ticket-box-offset)",
        !(first && last) && RAIL,
        first ? "before:top-1/2" : "before:top-0",
        last ? "before:bottom-1/2" : "before:bottom-0"
      )}
    >
      <span className="relative z-10 grid h-5 place-items-center">
        <ActorMark actor={actor} />
      </span>
      <p className="min-w-0 text-sm leading-5 text-muted-foreground">
        <ActorName actor={actor} />{" "}
        <ActivityLineView line={line} lookups={lookups} />
        <span aria-hidden> · </span>
        <TimelineTime at={at} />
      </p>
    </li>
  )
}

export function TicketTimeline<C>({
  ticketId,
  comments,
  renderComment
}: Readonly<{
  ticketId: TicketId
  comments: ReadonlyArray<TimelineComment<C>>
  renderComment: (comment: TimelineComment<C>) => ReactNode
}>) {
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

  if (AsyncResult.isInitial(result)) {
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
  const { items, hasOlder } = AsyncResult.isSuccess(result)
    ? result.value
    : { items: [], hasOlder: false }
  const events = timelineEvents({ activity: items, comments, hasOlder })
  const visible = showAll ? events : events.slice(-INITIAL_VISIBLE)
  const canShowOlder = visible.length < events.length || hasOlder
  const rows = timelineRows(visible)

  return (
    <div className="space-y-3">
      {canShowOlder && (
        <button
          type="button"
          disabled={result.waiting}
          onClick={() => {
            if (visible.length < events.length) setShowAll(true)
            else setOlderPages(olderPages + 1)
          }}
          className="ml-[calc(var(--ticket-box-offset)+28px)] text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-70"
        >
          {m.tickets_activity_show_older()}
        </button>
      )}
      <ol>
        {rows.flatMap((row) => {
          if (row.kind === "comment") {
            return [
              <li key={row.key} className="py-3 first:pt-0 last:pb-0">
                {renderComment(row.comment)}
              </li>
            ]
          }
          const lines = activityLines(row.item)
          return lines.map((line, index) => (
            <EventRow
              key={`${row.key}:${index}`}
              actor={row.actor}
              at={row.at}
              line={line}
              lookups={lookups}
              first={row.first && index === 0}
              last={row.last && index === lines.length - 1}
            />
          ))
        })}
      </ol>
      {AsyncResult.isFailure(result) && (
        <p className="text-sm text-destructive">
          {m.tickets_activity_load_failed()}
        </p>
      )}
    </div>
  )
}
