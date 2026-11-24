import { useAtomValue } from "@effect/atom-react"
import type {
  ActivitySystemSource,
  TicketActivityActor,
  TicketId
} from "@pp/shared"
import { Avatar, AvatarFallback } from "@pp/ui/avatar"
import { Bot, GitBranch, Import, type IconType } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import {
  Timeline,
  TimelineActor,
  TimelineEntry,
  TimelineEvent,
  TimelineRun,
  TimelineSkeleton
} from "@pp/ui/timeline"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { AnimatePresence } from "motion/react"
import { useMemo, useState, type ReactNode } from "react"

import claudeLogo from "@/assets/logos/claude.svg"
import codexDarkLogo from "@/assets/logos/codex_dark.svg"
import codexLightLogo from "@/assets/logos/codex_light.svg"
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
  TimelineRow,
  type TimelineComment,
  type TimelineLine,
  type TimelineOrder
} from "@/features/tickets/lib/timeline"
import { m } from "@/paraglide/messages"

const SYSTEM_ICONS: Readonly<Record<ActivitySystemSource, IconType>> = {
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

// An actor's 20px mark: a member's avatar, an agent's logo, or a system
// source's glyph.
const size = 20
const box = "size-5"
const glyph = "size-3"

function ActorMark({ actor }: Readonly<{ actor: TicketActivityActor | null }>) {
  if (actor?.kind === "imported")
    return (
      <MemberAvatar
        member={{ id: actor.sourceId, name: actor.displayName }}
        size={size}
      />
    )
  if (actor !== null && actor.kind !== "system") {
    const logo = agentLogo(actor)
    if (logo === undefined)
      return <MemberAvatar member={actor.user} size={size} />
    return (
      <Avatar aria-hidden className={box}>
        <AvatarFallback>
          <img src={logo.light} alt="" className={cn(glyph, "dark:hidden")} />
          <img
            src={logo.dark}
            alt=""
            className={cn(glyph, "hidden dark:block")}
          />
        </AvatarFallback>
      </Avatar>
    )
  }
  const Icon = actor === null ? null : SYSTEM_ICONS[actor.source]
  return (
    <Avatar aria-hidden className={box}>
      <AvatarFallback>
        {Icon && <Icon className={glyph} strokeWidth={2} />}
      </AvatarFallback>
    </Avatar>
  )
}

const personKey = (actor: TicketActivityActor | null) =>
  actor === null ||
  actor.kind === "system" ||
  actor.kind === "imported" ||
  agentLogo(actor) !== undefined
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
      <TimelineActor>
        {actor === null
          ? m.tickets_activity_actor_unknown()
          : SYSTEM_NAMES[actor.source]()}
      </TimelineActor>
    )
  }
  if (actor.kind === "imported")
    return <TimelineActor>{actor.displayName}</TimelineActor>
  const name = actor.user.name || actor.user.email
  if (actor.kind === "user") return <TimelineActor>{name}</TimelineActor>
  return (
    <TimelineActor
      via={m.tickets_activity_actor_via({ client: actor.client.name })}
    >
      {name}
    </TimelineActor>
  )
}

function EventRow({
  line: { actor, at, line },
  appear,
  lookups
}: Readonly<{
  line: TimelineLine
  appear?: boolean
  lookups: ActivityLookups
}>) {
  return (
    <TimelineEvent
      appear={appear}
      mark={<ActorMark actor={actor} />}
      actor={<ActorName actor={actor} />}
      time={<TimelineTime at={at} />}
    >
      <ActivityLineView line={line} lookups={lookups} />
    </TimelineEvent>
  )
}

// A run of changes: the older ones fold into one row that opens right under
// itself, in either order; the newest stay out (timelineRows decides how
// many fold).
function FoldedRun({
  folded,
  seenThrough,
  order,
  lookups
}: Readonly<{
  seenThrough: number
  folded: ReadonlyArray<TimelineLine>
  order: TimelineOrder
  lookups: ActivityLookups
}>) {
  const [open, setOpen] = useState(false)
  const [lead = null, ...rest] = people(folded)
  const others = rest.length
  const newest = folded.at(-1)
  return (
    <TimelineRun
      marks={
        <>
          <ActorMark actor={lead} />
          {rest.slice(0, 3).map((actor) => (
            <ActorMark key={personKey(actor)} actor={actor} />
          ))}
        </>
      }
      label={
        <>
          <ActorName actor={lead} />
          {others > 0 &&
            ` ${
              others === 1
                ? m.tickets_activity_run_others_one()
                : m.tickets_activity_run_others_many({ count: others })
            }`}{" "}
          {m.tickets_activity_run_changes({ count: folded.length })}
        </>
      }
      time={newest && <TimelineTime at={newest.at} />}
      open={open}
      onOpenChange={setOpen}
    >
      {(order === "asc" ? folded : folded.toReversed()).map((line) => (
        <EventRow
          key={line.key}
          line={line}
          appear={line.at.getTime() > seenThrough}
          lookups={lookups}
        />
      ))}
    </TimelineRun>
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

  const newest = AsyncResult.isSuccess(result)
    ? (result.value.items[0]?.occurredAt.getTime() ?? -Infinity)
    : undefined
  const [head, setHead] = useState({ newest, previous: newest })
  if (
    newest !== undefined &&
    (head.newest === undefined || newest > head.newest)
  ) {
    setHead({ newest, previous: head.newest })
  }
  const seenThrough = head.previous

  const activity = AsyncResult.isSuccess(result) ? result.value : undefined
  const rows = useMemo(
    () =>
      timelineRows(
        timelineEvents({
          activity: activity?.items ?? [],
          hasOlder: activity?.hasOlder ?? false,
          comments
        }),
        order
      ),
    [activity, comments, order]
  )

  if (AsyncResult.isInitial(result)) {
    return <TimelineSkeleton label={m.tickets_activity_loading()} />
  }

  const lookups: ActivityLookups = {
    members: project.members,
    statuses: AsyncResult.isSuccess(statusesResult) ? statusesResult.value : [],
    tags: AsyncResult.isSuccess(tagsResult) ? tagsResult.value : [],
    types
  }

  return (
    <div className="space-y-3">
      <Timeline className="[--timeline-inset:var(--ticket-box-offset)]">
        <AnimatePresence initial={false}>
          {rows.flatMap((row) => {
            if (TimelineRow.$is("comment")(row)) {
              return [
                <TimelineEntry key={row.key} appear={row.comment.appear}>
                  {renderComment(row.comment)}
                </TimelineEntry>
              ]
            }
            const events = row.lines
              .slice(row.fold)
              .map((line) => (
                <EventRow
                  key={line.key}
                  line={line}
                  appear={
                    seenThrough !== undefined && line.at.getTime() > seenThrough
                  }
                  lookups={lookups}
                />
              ))
            if (row.fold > 0) {
              events.unshift(
                <FoldedRun
                  key={`fold:${row.key}`}
                  folded={row.lines.slice(0, row.fold)}
                  seenThrough={seenThrough ?? Infinity}
                  order={order}
                  lookups={lookups}
                />
              )
            }
            return order === "asc" ? events : events.toReversed()
          })}
        </AnimatePresence>
      </Timeline>
      {AsyncResult.isFailure(result) && (
        <p role="alert" className="text-body text-destructive">
          {m.tickets_activity_load_failed()}
        </p>
      )}
    </div>
  )
}
