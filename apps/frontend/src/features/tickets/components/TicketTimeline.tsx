import { useAtomValue } from "@effect/atom-react"
import type {
  ActivitySystemSource,
  TicketActivityActor,
  TicketId
} from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import {
  Bot,
  ChevronRight,
  GitBranch,
  Import,
  type LucideIcon
} from "lucide-react"
import { useState, type ReactNode } from "react"

import claudeLogo from "@/assets/logos/claude.svg"
import codexDarkLogo from "@/assets/logos/codex_dark.svg"
import codexLightLogo from "@/assets/logos/codex_light.svg"
import { Avatar, AvatarFallback, AvatarGroup } from "@/components/ui/avatar"
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
  ticketActivity,
  ticketActivityRequest
} from "@/features/tickets/atoms/ticketActivity"
import { useIsNewSinceRead } from "@/features/tickets/components/ReadSince"
import {
  ActivityLineView,
  type ActivityLookups
} from "@/features/tickets/components/TicketActivityLine"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import { actorKey } from "@/features/tickets/lib/activityGroups"
import {
  timelineEvents,
  timelineRows,
  type TimelineComment,
  type TimelineLine,
  type TimelineOrder
} from "@/features/tickets/lib/timeline"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

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

const AGENT_LOGOS = [
  { match: "claude", light: claudeLogo, dark: claudeLogo },
  { match: "codex", light: codexLightLogo, dark: codexDarkLogo },
  { match: "chatgpt", light: codexLightLogo, dark: codexDarkLogo },
  { match: "openai", light: codexLightLogo, dark: codexDarkLogo }
] as const

const agentLogo = (actor: TicketActivityActor | null) =>
  actor?.kind === "agent"
    ? AGENT_LOGOS.find(({ match }) =>
        actor.client.name.toLowerCase().includes(match)
      )
    : undefined

function ActorMark({ actor }: Readonly<{ actor: TicketActivityActor | null }>) {
  if (actor !== null && actor.kind !== "system") {
    const logo = agentLogo(actor)
    if (logo === undefined)
      return <MemberAvatar member={actor.user} size={20} />
    return (
      <Avatar aria-hidden className="size-5">
        <AvatarFallback>
          <img src={logo.light} alt="" className="size-3 dark:hidden" />
          <img src={logo.dark} alt="" className="hidden size-3 dark:block" />
        </AvatarFallback>
      </Avatar>
    )
  }
  const Icon = actor === null ? null : SYSTEM_ICONS[actor.source]
  return (
    <Avatar aria-hidden className="size-5">
      <AvatarFallback>
        {Icon && <Icon className="size-3" strokeWidth={2} />}
      </AvatarFallback>
    </Avatar>
  )
}

const personKey = (actor: TicketActivityActor | null) =>
  actor === null || actor.kind === "system" || agentLogo(actor) !== undefined
    ? actorKey(actor)
    : `user:${actor.user.id}`

const people = (lines: ReadonlyArray<TimelineLine>) => {
  const byPerson = new Map<string, TicketActivityActor | null>()
  for (const { actor } of lines) {
    const key = personKey(actor)
    if (!byPerson.has(key) || actor?.kind === "user") byPerson.set(key, actor)
  }
  return [...byPerson.values()]
}

function ActorName({ actor }: Readonly<{ actor: TicketActivityActor | null }>) {
  if (actor === null || actor.kind === "system") {
    return (
      <span className="font-semibold">
        {actor === null
          ? m.tickets_activity_actor_unknown()
          : SYSTEM_NAMES[actor.source]()}
      </span>
    )
  }
  const name = actor.user.name || actor.user.email
  if (actor.kind === "user") {
    return <span className="font-semibold">{name}</span>
  }
  return (
    <span className="font-semibold">
      {name}{" "}
      <span className="font-normal text-muted-foreground">
        {m.tickets_activity_actor_via({ client: actor.client.name })}
      </span>
    </span>
  )
}

const RAIL =
  "before:absolute before:left-[calc(var(--ticket-box-offset)+9.5px)] before:w-px before:bg-border before:content-['']"

function railClass(first: boolean, last: boolean) {
  return cn(
    "relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-2 py-2 pl-(--ticket-box-offset)",
    !(first && last) && [
      RAIL,
      first ? "before:top-1/2" : "before:top-0",
      last ? "before:bottom-1/2" : "before:bottom-0"
    ]
  )
}

function EventRow({
  line: { actor, at, line },
  lookups,
  first,
  last
}: Readonly<{
  line: TimelineLine
  lookups: ActivityLookups
  first: boolean
  last: boolean
}>) {
  const isNew = useIsNewSinceRead(at)
  return (
    <li
      className={railClass(first, last)}
      data-new-since-read={isNew || undefined}
    >
      <span className="relative z-10 grid h-5 place-items-center">
        <ActorMark actor={actor} />
      </span>
      <div
        className={cn(
          "min-w-0 text-body leading-5 wrap-anywhere text-muted-foreground",
          isNew && "text-foreground"
        )}
      >
        {isNew && <NewMark />}
        <ActorName actor={actor} />{" "}
        <ActivityLineView line={line} lookups={lookups} />
        <span aria-hidden> · </span>
        <TimelineTime at={at} />
      </div>
    </li>
  )
}

function RunRows({
  lines,
  fold,
  order,
  lookups
}: Readonly<{
  lines: ReadonlyArray<TimelineLine>
  fold: number
  order: TimelineOrder
  lookups: ActivityLookups
}>) {
  const [open, setOpen] = useState(false)
  const visible = open ? lines : lines.slice(fold)
  const ordered = order === "asc" ? visible : visible.toReversed()
  const events = ordered.map((line, index) => (
    <EventRow
      key={line.key}
      line={line}
      lookups={lookups}
      first={index === 0 && (order === "desc" || fold === 0)}
      last={index === ordered.length - 1 && (order === "asc" || fold === 0)}
    />
  ))
  if (fold === 0) return events
  const folded = lines.slice(0, fold)
  const [lead = null, ...rest] = people(folded)
  const others = rest.length
  const newest = folded.at(-1)
  const empty = visible.length === 0
  const summary = (
    <li
      className={cn(
        order === "asc" ? railClass(true, empty) : railClass(empty, true),
        "grid-cols-[auto_minmax(0,1fr)]"
      )}
    >
      <AvatarGroup className="relative z-10 h-5 items-center -space-x-1.5">
        <ActorMark actor={lead} />
        {rest.slice(0, 3).map((actor) => (
          <ActorMark key={personKey(actor)} actor={actor} />
        ))}
      </AvatarGroup>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="group flex min-w-0 items-center gap-1 text-left text-body leading-5 text-muted-foreground"
      >
        <span className="min-w-0">
          <ActorName actor={lead} />
          {others > 0 &&
            ` ${
              others === 1
                ? m.tickets_activity_run_others_one()
                : m.tickets_activity_run_others_many({ count: others })
            }`}{" "}
          {m.tickets_activity_run_changes({ count: fold })}
          {newest && (
            <>
              <span aria-hidden> · </span>
              <TimelineTime at={newest.at} />
            </>
          )}
        </span>
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 transition-transform group-hover:text-foreground",
            open && "rotate-90"
          )}
        />
      </button>
    </li>
  )
  return order === "asc" ? (
    <>
      {summary}
      {events}
    </>
  ) : (
    <>
      {events}
      {summary}
    </>
  )
}

function NewMark() {
  return <span className="sr-only">{m.tickets_activity_new_since_read()} </span>
}

function CommentRow({
  at,
  children
}: Readonly<{ at: Date; children: ReactNode }>) {
  const isNew = useIsNewSinceRead(at)
  return (
    <li
      data-new-since-read={isNew || undefined}
      className={cn(
        "relative py-3 first:pt-0 last:pb-0",
        isNew &&
          "before:absolute before:top-4 before:-left-3 before:size-1.5 before:rounded-full before:bg-foreground before:content-[''] first:before:top-1"
      )}
    >
      {isNew && <NewMark />}
      {children}
    </li>
  )
}

export function TicketTimeline<C>({
  ticketId,
  comments,
  order,
  renderComment
}: Readonly<{
  ticketId: TicketId
  comments: ReadonlyArray<TimelineComment<C>>
  order: TimelineOrder
  renderComment: (comment: TimelineComment<C>) => ReactNode
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketActivityRequest(orgSlug, slug, ticketId)
  const result = useAtomValue(ticketActivity(req))
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, slug))
  )
  const tagsResult = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  const project = useProject()
  const types = useTicketTypes(orgSlug, slug)

  if (AsyncResult.isInitial(result)) {
    return (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">{m.tickets_activity_loading()}</span>
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  const lookups: ActivityLookups = {
    members: project.members,
    statuses: AsyncResult.isSuccess(statusesResult) ? statusesResult.value : [],
    tags: AsyncResult.isSuccess(tagsResult) ? tagsResult.value : [],
    types
  }
  const { items, hasOlder } = AsyncResult.isSuccess(result)
    ? result.value
    : { items: [], hasOlder: false }
  const events = timelineEvents({ activity: items, comments, hasOlder })
  const rows = timelineRows(events, order)

  return (
    <div className="space-y-3">
      <ol>
        {rows.map((row) =>
          row.kind === "comment" ? (
            <CommentRow key={row.key} at={row.comment.at}>
              {renderComment(row.comment)}
            </CommentRow>
          ) : (
            <RunRows
              key={row.key}
              lines={row.lines}
              fold={row.fold}
              order={order}
              lookups={lookups}
            />
          )
        )}
      </ol>
      {AsyncResult.isFailure(result) && (
        <p role="alert" className="text-body text-destructive">
          {m.tickets_activity_load_failed()}
        </p>
      )}
    </div>
  )
}
