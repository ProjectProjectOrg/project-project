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
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { EpicTextPrefix } from "@/features/tickets/components/ticket-list/EpicLabel"
import { EstimateChip } from "@/features/tickets/components/ticket-list/EstimateField"
import { BlockedLine } from "@/features/tickets/components/TicketHoverCard"
import {
  PRIORITY_LABELS,
  PRIORITY_META
} from "@/features/tickets/lib/priorityMeta"
import { openBlockers } from "@/features/tickets/lib/relationGroups"
import {
  statusLabelFor,
  statusMetaFor,
  TYPE_LABELS,
  TYPE_META
} from "@/features/tickets/lib/ticketMeta"
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
  const ticket = Result.isSuccess(result) ? result.value : shown
  if (ticket === null) return <PeekSkeleton />
  const status = statusMetaFor(ticket.status, statuses)
  const priority = PRIORITY_META[ticket.priority]
  const type = TYPE_META[ticket.type]
  const StatusIcon = status.icon
  const PriorityIcon = priority.icon
  const TypeIcon = type.icon
  const assignees = ticket.assignees.flatMap((id) => {
    const member = scope.members.find((candidate) => candidate.id === id)
    return member === undefined ? [] : [member]
  })
  const body = ticket.body.trim()
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      {prefetch.map((id) => (
        <TicketPrefetch key={id} ticketId={id} scope={scope} />
      ))}
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {ticket.id}
        </span>
        <h2 className="line-clamp-2 text-[15px] leading-snug font-medium">
          {ticket.parent !== undefined && ticket.parent !== null && (
            <EpicTextPrefix
              orgSlug={scope.orgSlug}
              slug={scope.slug}
              epicId={ticket.parent}
            />
          )}
          {ticket.title}
        </h2>
      </div>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[13px]">
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
        <Meta>
          <TypeIcon className="size-3.5" strokeWidth={1.75} />
          {TYPE_LABELS[ticket.type]()}
        </Meta>
        {estimation !== "off" && ticket.estimate !== null && (
          <EstimateChip
            ticket={ticket}
            mode={estimation}
            className="text-[13px] text-foreground"
          />
        )}
        {assignees.map((member) => (
          <Meta key={member.id}>
            <MemberAvatar member={member} size={16} />
            {member.name}
          </Meta>
        ))}
      </div>
      <BlockedLine
        blockers={openBlockers(
          ticket.relations,
          new Set(finishedStatusSlugs(statuses))
        )}
        statuses={statuses}
      />
      <div className="min-h-0 flex-1 overflow-hidden border-t border-border/60 [mask-image:linear-gradient(to_bottom,black_calc(100%-3rem),transparent)] pt-4">
        {body === "" ? (
          <p className="text-[13px] text-muted-foreground">
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

function Meta({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">{children}</span>
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
