import { useAtomValue } from "@effect/atom-react"
import type {
  Estimate,
  LinkedTicket,
  Member,
  ProjectStatus,
  TicketId,
  TicketPriority,
  TicketStatus,
  TicketType
} from "@pp/shared"
import { finishedStatusSlugs, flattenTicketBlocks } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { OctagonMinus } from "lucide-react"
import type { ComponentProps } from "react"
import { lazy, Suspense } from "react"

import { PopoverContent } from "@/components/ui/popover"
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
import {
  PRIORITY_LABELS,
  PRIORITY_META
} from "@/features/tickets/lib/priorityMeta"
import { openBlockers } from "@/features/tickets/lib/relationGroups"
import {
  statusMetaFor,
  statusLabelFor,
  TYPE_LABELS,
  TYPE_META
} from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type MarkdownModule = typeof import("@/features/editor/components/Markdown")

let loadedMarkdown: MarkdownModule | null = null

export const loadMarkdown = () =>
  import("@/features/editor/components/Markdown").then((mod) => {
    loadedMarkdown = mod
    return mod
  })

const LazyMarkdown = lazy(() =>
  loadMarkdown().then((mod) => ({ default: mod.Markdown }))
)

const EMPTY_STATUSES: ReadonlyArray<ProjectStatus> = []

export const previewOverflows = (body: string): boolean => {
  const text = flattenTicketBlocks(body)
  return text.split("\n").length > 6 || text.length > 320
}

type TicketHoverCardScope = {
  readonly orgSlug: string
  readonly slug: string
  readonly members?: ReadonlyArray<Member>
}

const TicketHoverCardError = () => (
  <div className="text-caption text-muted-foreground">
    {m.tickets_mention_card_not_available()}
  </div>
)

export function TicketHoverCard({
  ticketId,
  scope,
  anchor,
  interactive = true
}: {
  ticketId: TicketId
  scope: TicketHoverCardScope
  anchor?: ComponentProps<typeof PopoverContent>["anchor"]
  interactive?: boolean
}) {
  return (
    <PopoverContent
      className={cn("w-80", !interactive && "pointer-events-none")}
      align="start"
      anchor={anchor}
      inert={interactive ? undefined : true}
    >
      <TicketPreviewBody
        ticketId={ticketId}
        scope={scope}
        interactive={interactive}
      />
    </PopoverContent>
  )
}

export function TicketPreviewBody({
  ticketId,
  scope,
  interactive
}: {
  ticketId: TicketId
  scope: TicketHoverCardScope
  interactive: boolean
}) {
  const req = ticketRequest(scope.orgSlug, scope.slug, ticketId)
  const result = useAtomValue(ticketDetail(req))
  const statusesReq = statusesRequest(scope.orgSlug, scope.slug)
  const statusesResult = useAtomValue(statusesFor(statusesReq))
  const statuses: ReadonlyArray<ProjectStatus> = Result.isSuccess(
    statusesResult
  )
    ? statusesResult.value
    : EMPTY_STATUSES

  return Result.matchWithError(result, {
    onInitial: () => <CardSkeleton />,
    onError: () => <TicketHoverCardError />,
    onDefect: () => <TicketHoverCardError />,
    onSuccess: ({ value: ticket }) => {
      const body = ticket.body.trim()
      const isOverflowing = previewOverflows(body)
      const Markdown = loadedMarkdown?.Markdown ?? LazyMarkdown
      return (
        <div className="space-y-2">
          <div className="line-clamp-2 text-body leading-snug font-semibold">
            <EpicTextPrefix parent={ticket.parent} />
            {ticket.title}
          </div>
          <MetaRow ticket={ticket} scope={scope} statuses={statuses} />
          <BlockedLine
            blockers={openBlockers(
              ticket.relations,
              new Set(finishedStatusSlugs(statuses))
            )}
            statuses={statuses}
          />
          {body.length > 0 && (
            <div className="relative">
              <Suspense fallback={null}>
                <Markdown
                  className="line-clamp-6 text-caption leading-relaxed text-muted-foreground [&_*]:!my-0 [&_pre]:!my-1"
                  blocks="flat"
                >
                  {body}
                </Markdown>
              </Suspense>
              {isOverflowing && interactive && (
                <>
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-popover via-popover/90 to-transparent"
                  />
                  <Link
                    to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                    params={{
                      orgSlug: scope.orgSlug,
                      slug: scope.slug,
                      id: ticketId
                    }}
                    className="absolute right-0 bottom-0 text-caption text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {m.tickets_mention_card_read_more()} →
                  </Link>
                </>
              )}
            </div>
          )}
          {ticket.branch && (
            <div>
              <TicketGitChip
                orgSlug={scope.orgSlug}
                slug={scope.slug}
                ticket={ticket}
              />
            </div>
          )}
        </div>
      )
    }
  })
}

function MetaRow({
  ticket,
  scope,
  statuses
}: {
  ticket: {
    status: TicketStatus
    type: TicketType
    priority: TicketPriority
    estimate: Estimate | null
    assignees: ReadonlyArray<string>
  }
  scope: TicketHoverCardScope
  statuses: ReadonlyArray<ProjectStatus>
}) {
  const statusMeta = statusMetaFor(ticket.status, statuses)
  const type = TYPE_META[ticket.type]
  const priority = PRIORITY_META[ticket.priority]
  const StatusIcon = statusMeta.icon
  const TypeIcon = type.icon
  const PriorityIcon = priority.icon
  const estimation = useAtomValue(
    projectEstimation(projectRequest(scope.orgSlug, scope.slug))
  )
  const visibleAssignees: Member[] = scope.members
    ? ticket.assignees
        .map((id) => scope.members?.find((member) => member.id === id))
        .filter((member): member is Member => !!member)
        .slice(0, 3)
    : []
  return (
    <div className="flex items-center gap-3 text-caption text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <StatusIcon
          className={cn("size-3.5", statusMeta.className)}
          style={statusMeta.color ? { color: statusMeta.color } : undefined}
          strokeWidth={1.75}
        />
        <span>{statusLabelFor(ticket.status, statuses)}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <TypeIcon className="size-3.5" strokeWidth={1.75} />
        <span>{TYPE_LABELS[ticket.type]()}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <PriorityIcon
          className={cn("size-3.5", priority.className)}
          strokeWidth={1.75}
        />
        <span>{PRIORITY_LABELS[ticket.priority]()}</span>
      </span>
      <EstimateChip ticket={ticket} mode={estimation} />
      {visibleAssignees.length > 0 && (
        <span className="ml-auto inline-flex items-center gap-1">
          {visibleAssignees.map((member) => (
            <MemberAvatar key={member.id} member={member} size={16} />
          ))}
        </span>
      )}
    </div>
  )
}

export function BlockedLine({
  blockers,
  statuses
}: {
  blockers: ReadonlyArray<LinkedTicket>
  statuses: ReadonlyArray<ProjectStatus>
}) {
  const [first] = blockers
  if (first === undefined) return null
  const meta = statusMetaFor(first.status, statuses)
  const StatusIcon = meta.icon
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-md bg-hover px-2 py-1.5 text-caption">
      <OctagonMinus
        className="size-3.5 shrink-0 text-state-warning"
        strokeWidth={1.75}
      />
      <span className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="shrink-0 text-muted-foreground">
          {m.tickets_hover_blocked_by()}
        </span>
        <span className="shrink-0 font-mono text-foreground">{first.id}</span>
        <span className="min-w-0 flex-1 truncate">{first.title}</span>
      </span>
      {blockers.length > 1 ? (
        <span className="shrink-0 text-muted-foreground">
          {m.tickets_hover_blocked_more({ count: blockers.length - 1 })}
        </span>
      ) : (
        <StatusIcon
          role="img"
          aria-label={meta.label}
          className={cn("size-3.5 shrink-0", meta.className)}
          style={meta.color ? { color: meta.color } : undefined}
          strokeWidth={1.75}
        />
      )}
    </div>
  )
}

function CardSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-3 w-1/2 rounded bg-muted" />
    </div>
  )
}
