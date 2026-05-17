import { Result, useAtomValue } from "@effect-atom/atom-react"
import { Link } from "@tanstack/react-router"
import { Markdown } from "@/components/Markdown"
import { MemberAvatar } from "@/components/MemberAvatar"
import { TicketGitChip } from "@/components/TicketGit"
import { useMentionScope, type MentionScope } from "@/mentions/scope"
import type { Member } from "@projectproject/shared"
import { ticketAtom, ticketKey } from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import { PRIORITY_LABELS, PRIORITY_META } from "@/lib/priority-meta"
import {
  STATUS_LABELS,
  STATUS_META,
  TYPE_LABELS,
  TYPE_META
} from "@/lib/ticket-meta"
import { m } from "@/paraglide/messages"
import type {
  TicketId,
  TicketPriority,
  TicketStatus,
  TicketType
} from "@projectproject/shared"

export function TicketMentionCard({ ticketId }: { ticketId: TicketId }) {
  const scope = useMentionScope()
  if (!scope) return null
  const result = useAtomValue(
    ticketAtom(ticketKey(scope.orgSlug, scope.slug, ticketId))
  )

  if (Result.isFailure(result)) {
    return (
      <div className="text-xs text-muted-foreground">
        {m.tickets_mention_card_not_available()}
      </div>
    )
  }

  if (!Result.isSuccess(result)) {
    return <CardSkeleton />
  }

  const ticket = result.value
  const body = ticket.body.trim()
  const isOverflowing =
    body.split("\n").length > 6 || body.length > 320

  return (
    <div className="space-y-2">
      <div className="line-clamp-2 text-sm font-medium leading-snug">
        {ticket.title}
      </div>
      <MetaRow ticket={ticket} scope={scope} />
      {body.length > 0 && (
        <div className="relative">
          <Markdown className="line-clamp-6 text-xs leading-relaxed text-muted-foreground [&_*]:!my-0 [&_pre]:!my-1">
            {body}
          </Markdown>
          {isOverflowing && (
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
                className="absolute bottom-0 right-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
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
            ticketId={ticketId}
          />
        </div>
      )}
    </div>
  )
}

function MetaRow({
  ticket,
  scope
}: {
  ticket: {
    status: TicketStatus
    type: TicketType
    priority: TicketPriority
    assignees: ReadonlyArray<string>
  }
  scope: MentionScope
}) {
  const status = STATUS_META[ticket.status]
  const type = TYPE_META[ticket.type]
  const priority = PRIORITY_META[ticket.priority]
  const StatusIcon = status.icon
  const TypeIcon = type.icon
  const PriorityIcon = priority.icon
  const visibleAssignees: Member[] = scope.members
    ? ticket.assignees
        .map((id) => scope.members?.find((member) => member.id === id))
        .filter((member): member is Member => !!member)
        .slice(0, 3)
    : []
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1">
        <StatusIcon
          className={cn("size-3.5", status.className)}
          strokeWidth={1.75}
        />
        <span>{STATUS_LABELS[ticket.status]()}</span>
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

function CardSkeleton() {
  return (
    <div className="space-y-2">
      <div className="h-4 w-3/4 rounded bg-muted" />
      <div className="h-3 w-1/2 rounded bg-muted" />
    </div>
  )
}
