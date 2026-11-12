import { useAtomValue } from "@effect/atom-react"
import {
  finishedStatusSlugs,
  type Member,
  type ProjectStatus,
  type TicketDetail,
  type TicketId
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react"

import { TicketGitChip } from "@/features/github/components/ticket-git/TicketGit"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import {
  projectEstimation,
  projectRequest
} from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  childTickets,
  childTicketsRequest
} from "@/features/tickets/atoms/childTickets"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { EpicTextPrefix } from "@/features/tickets/components/ticket-list/EpicLabel"
import { EstimateChip } from "@/features/tickets/components/ticket-list/EstimateField"
import { BlockedLine } from "@/features/tickets/components/TicketHoverCard"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import {
  PRIORITY_LABELS,
  PRIORITY_META
} from "@/features/tickets/lib/priorityMeta"
import { openBlockers } from "@/features/tickets/lib/relationGroups"
import {
  statusLabelFor,
  statusMetaFor
} from "@/features/tickets/lib/ticketMeta"
import { resolveType } from "@/features/tickets/lib/ticketTypes"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const loadMarkdown = () => import("@/features/editor/components/Markdown")

const Markdown = lazy(() =>
  loadMarkdown().then((mod) => ({ default: mod.Markdown }))
)

const NO_STATUSES: ReadonlyArray<ProjectStatus> = []

export type TicketPeekScope = Readonly<{
  orgSlug: string
  slug: string
  members: ReadonlyArray<Member>
}>

export function TicketPeek({
  ticketId,
  scope,
  prefetch
}: Readonly<{
  ticketId: TicketId
  scope: TicketPeekScope
  prefetch: ReadonlyArray<TicketId>
}>) {
  const result = useAtomValue(
    ticketDetail(ticketRequest(scope.orgSlug, scope.slug, ticketId))
  )
  const [shown, setShown] = useState<TicketDetail | null>(null)
  if (Result.isSuccess(result) && result.value !== shown) {
    setShown(result.value)
  }
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(scope.orgSlug, scope.slug))
  )
  const estimation = useAtomValue(
    projectEstimation(projectRequest(scope.orgSlug, scope.slug))
  )
  const statuses = Result.isSuccess(statusesResult)
    ? statusesResult.value
    : NO_STATUSES
  const types = useTicketTypes(scope.orgSlug, scope.slug)
  if (Result.isFailure(result)) {
    return (
      <p role="alert" className="p-4 text-body text-destructive">
        {m.tickets_peek_load_failed()}
      </p>
    )
  }
  const ticket = Result.isSuccess(result) ? result.value : shown
  if (ticket === null) return <PeekSkeleton />
  const status = statusMetaFor(ticket.status, statuses)
  const priority = PRIORITY_META[ticket.priority]
  const type = resolveType(types, ticket.type)
  const StatusIcon = status.icon
  const PriorityIcon = priority.icon
  const assignees = ticket.assignees.flatMap((id) => {
    const member = scope.members.find((candidate) => candidate.id === id)
    return member === undefined ? [] : [member]
  })
  const body = ticket.body.trim()
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 px-4 pt-4 [&>:last-child]:pb-4">
      {prefetch.map((id) => (
        <TicketPrefetch key={id} ticketId={id} scope={scope} />
      ))}
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-caption text-muted-foreground tabular-nums">
            {ticket.id}
          </span>
          <h2 className="line-clamp-2 text-title leading-snug font-semibold">
            <EpicTextPrefix parent={ticket.parent} />
            {ticket.title}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-body">
          <Meta>
            <StatusIcon
              className={cn("size-3.5", status.className)}
              style={status.color ? { color: status.color } : undefined}
              strokeWidth={1.75}
            />
            {statusLabelFor(ticket.status, statuses)}
          </Meta>
          <Meta>
            <PriorityIcon
              className={cn("size-3.5", priority.className)}
              strokeWidth={1.75}
            />
            {PRIORITY_LABELS[ticket.priority]()}
          </Meta>
          {type !== null && (
            <Meta>
              <TypeGlyph type={type} className="size-3.5" />
              {type.name}
            </Meta>
          )}
          {estimation !== "off" && ticket.estimate !== null && (
            <EstimateChip
              ticket={ticket}
              mode={estimation}
              className="text-body text-foreground"
            />
          )}
          {assignees.map((member) => (
            <Meta key={member.id}>
              <MemberAvatar member={member} size={16} />
              {member.name}
            </Meta>
          ))}
        </div>
      </div>
      <BlockedLine
        blockers={openBlockers(
          ticket.relations,
          new Set(finishedStatusSlugs(statuses))
        )}
        statuses={statuses}
      />
      <div className="min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]">
        {body === "" ? (
          <p className="text-body text-muted-foreground">
            {m.tickets_peek_no_description()}
          </p>
        ) : (
          <Suspense fallback={null}>
            <Markdown
              className="text-muted-foreground"
              blocks="flat"
              size="compact"
            >
              {body}
            </Markdown>
          </Suspense>
        )}
      </div>
      {(ticket.subTicketCount ?? 0) > 0 && (
        <SubTickets
          parent={ticket.id}
          count={ticket.subTicketCount ?? 0}
          scope={scope}
          statuses={statuses}
        />
      )}
      {ticket.branch !== null && (
        <TicketGitChip
          orgSlug={scope.orgSlug}
          slug={scope.slug}
          ticket={ticket}
        />
      )}
    </div>
  )
}

export function TicketPrefetch({
  ticketId,
  scope
}: Readonly<{ ticketId: TicketId; scope: Omit<TicketPeekScope, "members"> }>) {
  useAtomValue(ticketDetail(ticketRequest(scope.orgSlug, scope.slug, ticketId)))
  useEffect(() => {
    void loadMarkdown()
  }, [])
  return null
}

const SUB_TICKET_LIMIT = 5

function SubTickets({
  parent,
  count,
  scope,
  statuses
}: Readonly<{
  parent: TicketId
  count: number
  scope: TicketPeekScope
  statuses: ReadonlyArray<ProjectStatus>
}>) {
  const result = useAtomValue(
    childTickets(childTicketsRequest(scope.orgSlug, scope.slug, parent))
  )
  const rows = Result.isSuccess(result)
    ? result.value.slice(0, SUB_TICKET_LIMIT)
    : null
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-caption text-muted-foreground">
        {m.tickets_peek_sub_tickets()}
      </h3>
      <ul className="flex flex-col">
        {rows === null
          ? Array.from(
              { length: Math.min(count, SUB_TICKET_LIMIT) },
              (_, index) => (
                <li key={index} className="flex h-7 items-center">
                  <span className="h-3 w-2/3 rounded bg-muted" />
                </li>
              )
            )
          : rows.map(({ ticket }) => {
              const meta = statusMetaFor(ticket.status, statuses)
              const StatusIcon = meta.icon
              return (
                <li
                  key={ticket.id}
                  className="flex h-7 min-w-0 items-center gap-2 text-body"
                >
                  <StatusIcon
                    className={cn("size-3.5 shrink-0", meta.className)}
                    style={meta.color ? { color: meta.color } : undefined}
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {ticket.title}
                  </span>
                </li>
              )
            })}
      </ul>
      {count > SUB_TICKET_LIMIT && (
        <p className="text-caption text-muted-foreground">
          {m.tickets_peek_more_sub_tickets({ count: count - SUB_TICKET_LIMIT })}
        </p>
      )}
    </section>
  )
}

function Meta({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 [&>svg]:-translate-y-[0.5px]">
      {children}
    </span>
  )
}

function PeekSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="h-3 w-16 rounded bg-muted" />
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="flex flex-col gap-2.5">
        <div className="h-3 w-1/2 rounded bg-muted" />
        <div className="h-3 w-2/5 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
      </div>
    </div>
  )
}
