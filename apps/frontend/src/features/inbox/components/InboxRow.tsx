import { useAtomValue } from "@effect/atom-react"
import type {
  InboxEvent,
  InboxItem,
  ProjectStatus,
  TicketActivityActor
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Match from "effect/Match"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { BellOff, Check } from "lucide-react"
import { memo, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { ActorMark } from "@/features/tickets/components/ActorMark"
import { TimelineTime } from "@/features/tickets/components/TimelineTime"
import { statusLabelFor } from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const NO_STATUSES: ReadonlyArray<ProjectStatus> = []

const actorName = (actor: TicketActivityActor | null): string => {
  if (actor === null) return m.tickets_activity_actor_unknown()
  if (actor.kind === "system") {
    if (actor.source === "github") return m.tickets_activity_actor_github()
    if (actor.source === "import") return m.tickets_activity_actor_import()
    return m.tickets_activity_actor_automation()
  }
  return actor.user.name || actor.user.email
}

export const describeEvent = (
  event: InboxEvent,
  actor: TicketActivityActor | null,
  statusLabel: (status: string) => string
): string => {
  const name = actorName(actor)
  return Match.value(event).pipe(
    Match.discriminatorsExhaustive("kind")({
      assigned: () => m.inbox_event_assigned({ actor: name }),
      mentioned: ({ excerpt }) =>
        excerpt
          ? m.inbox_event_said({ actor: name, text: excerpt })
          : m.inbox_event_mentioned({ actor: name }),
      commented: ({ excerpt }) =>
        excerpt
          ? m.inbox_event_said({ actor: name, text: excerpt })
          : m.inbox_event_commented({ actor: name }),
      status_changed: ({ from, to }) =>
        m.inbox_event_status_changed({
          actor: name,
          from: statusLabel(from),
          to: statusLabel(to)
        }),
      unblocked: ({ by }) => m.inbox_event_unblocked({ ticket: by }),
      archived: () => m.inbox_event_archived({ actor: name }),
      moved: ({ fromProject }) =>
        m.inbox_event_moved({ actor: name, project: fromProject }),
      split: ({ into }) =>
        m.inbox_event_split({ actor: name, count: into.length }),
      reassigned: () => m.inbox_event_reassigned({ actor: name })
    })
  )
}

type InboxRowProps = Readonly<{
  orgSlug: string
  item: InboxItem
  rowKey: string
  selected: boolean
  tabbable: boolean
  onDone: (item: InboxItem) => void
  onUnsubscribe: (item: InboxItem) => void
}>

export const InboxRow = memo(function InboxRow({
  orgSlug,
  item,
  rowKey,
  selected,
  tabbable,
  onDone,
  onUnsubscribe
}: InboxRowProps) {
  const statuses = useAtomValue(
    statusesFor(statusesRequest(orgSlug, item.projectSlug))
  )
  const event = describeEvent(item.latest, item.actor, (status) =>
    statusLabelFor(
      status,
      AsyncResult.isSuccess(statuses) ? statuses.value : NO_STATUSES
    )
  )
  const more = item.unreadCount - 1
  return (
    <li
      className={cn(
        "group/reveal relative isolate grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-0.5 rounded-lg py-2.5 pr-3 pl-4 transition-colors hover:bg-hover",
        selected && "bg-active hover:bg-active"
      )}
    >
      <span className="relative row-span-2 pt-px">
        <ActorMark actor={item.actor} />
        <span
          aria-hidden
          className={cn(
            "absolute top-2 -left-3 size-1.5 rounded-full",
            item.unread ? "bg-foreground" : "bg-transparent"
          )}
        />
      </span>
      <Link
        to="/orgs/$orgSlug/inbox"
        params={{ orgSlug }}
        search={{ ticket: rowKey }}
        aria-current={selected ? "true" : undefined}
        tabIndex={tabbable ? 0 : -1}
        data-inbox-row={rowKey}
        className="flex min-w-0 items-center gap-2 outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
      >
        {item.unread && (
          <span className="sr-only">{m.inbox_unread_label()}, </span>
        )}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-body",
            item.unread ? "font-semibold" : "text-muted-foreground"
          )}
        >
          {item.ticket.title}
        </span>
        <TimelineTime
          at={item.latestAt}
          compact
          className="min-w-14 shrink-0 text-right text-caption group-focus-within/reveal:invisible group-hover/reveal:invisible"
        />
      </Link>
      <div className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
        {item.direct.map((reason) => (
          <span key={reason} className="shrink-0 font-semibold text-foreground">
            {reason === "assigned"
              ? m.inbox_reason_assigned()
              : m.inbox_reason_mentioned()}
          </span>
        ))}
        <span className="min-w-0 truncate">{event}</span>
        {more > 0 && (
          <span className="shrink-0 tabular-nums">
            {m.inbox_more_events({ count: more })}
          </span>
        )}
        <span className="ml-auto shrink-0 font-mono">{item.ticket.id}</span>
      </div>
      <div className="absolute top-1.5 right-2 z-10 flex gap-0.5 opacity-0 transition-opacity group-focus-within/reveal:opacity-100 group-hover/reveal:opacity-100">
        <RowAction
          label={m.inbox_unsubscribe()}
          tabbable={selected}
          onClick={() => onUnsubscribe(item)}
        >
          <BellOff className="size-3.5" strokeWidth={1.75} />
        </RowAction>
        <RowAction
          label={m.inbox_mark_done()}
          tabbable={selected}
          onClick={() => onDone(item)}
        >
          <Check className="size-3.5" strokeWidth={1.75} />
        </RowAction>
      </div>
    </li>
  )
})

function RowAction({
  label,
  tabbable,
  onClick,
  children
}: Readonly<{
  label: string
  tabbable: boolean
  onClick: () => void
  children: ReactNode
}>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="quiet"
            size="square-7"
            aria-label={label}
            tabIndex={tabbable ? 0 : -1}
            onClick={onClick}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
