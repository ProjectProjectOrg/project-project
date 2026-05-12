import { memo } from "react"
import { useNavigate } from "@tanstack/react-router"
import { TicketGitChip } from "@/components/TicketGit"
import { cn } from "@/lib/utils"
import type { Member, Ticket } from "@projectproject/shared"
import { AssigneeRowTrigger } from "@/components/TicketList/AssigneeField"
import { PriorityButton } from "@/components/TicketList/PriorityField"
import { TypeButton } from "@/components/TicketList/TypeField"

function SprintBoardCardImpl({
  orgSlug,
  slug,
  ticket,
  members
}: {
  orgSlug: string
  slug: string
  ticket: Ticket
  members: ReadonlyArray<Member>
}) {
  const navigate = useNavigate()
  const open = () => {
    void navigate({
      to: "/orgs/$orgSlug/projects/$slug/tickets/$id",
      params: { orgSlug, slug, id: ticket.id }
    })
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          open()
        }
      }}
      className="group/card flex cursor-pointer flex-col gap-2 rounded-md border border-border bg-background p-3 text-left outline-none transition-colors duration-100 hover:bg-accent/30 focus-visible:ring-1 focus-visible:ring-ring"
    >
      <div className="flex items-start gap-1.5">
        <TypeButton orgSlug={orgSlug} slug={slug} ticket={ticket} iconOnly />
        <span className="min-w-0 line-clamp-2 text-sm font-medium leading-snug">
          {ticket.title}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <PriorityButton
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          stopPropagation
        />
        <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
          {ticket.id}
        </span>
        <div className="min-w-0 flex-1 truncate">
          <TicketGitChip orgSlug={orgSlug} slug={slug} ticketId={ticket.id} />
        </div>
        <AssigneeRowTrigger
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          members={members}
          className={cn(
            "transition-opacity",
            ticket.assignees.length === 0 &&
              "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100"
          )}
        />
      </div>
    </div>
  )
}

export const SprintBoardCard = memo(SprintBoardCardImpl)
