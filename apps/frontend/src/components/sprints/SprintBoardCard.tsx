import { useAtomSet } from "@effect/atom-react"
import type { Member, Ticket, UpdateTicketInput } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { memo } from "react"

import { TicketGitChip } from "@/components/TicketGit"
import { AssigneeField } from "@/components/TicketList/AssigneeField"
import { PriorityButton } from "@/components/TicketList/PriorityField"
import { SplitTicketControl } from "@/components/TicketList/SplitControl"
import { TypeButton } from "@/components/TicketList/TypeField"
import { DeferredDropdownMenus } from "@/components/ui/dropdown-menu"
import {
  updateBoardTicket,
  type BoardRequest
} from "@/features/sprints/atoms/sprintBoard"
import {
  updateBacklogTicket,
  type BacklogRequest
} from "@/features/tickets/atoms/backlog"

function SprintBoardCardImpl({
  orgSlug,
  slug,
  req,
  backlogReq,
  onPatch,
  ticket,
  members
}: {
  orgSlug: string
  slug: string
  req?: BoardRequest
  backlogReq?: BacklogRequest
  onPatch?: (patch: UpdateTicketInput) => void
  ticket: Ticket
  members: ReadonlyArray<Member>
}) {
  if (onPatch) {
    return (
      <BoardCardFields
        orgSlug={orgSlug}
        slug={slug}
        ticket={ticket}
        members={members}
        onPatch={onPatch}
      />
    )
  }
  if (backlogReq) {
    return (
      <BacklogMutatingCard
        orgSlug={orgSlug}
        slug={slug}
        req={backlogReq}
        ticket={ticket}
        members={members}
      />
    )
  }
  if (req) {
    return (
      <BoardMutatingCard
        orgSlug={orgSlug}
        slug={slug}
        req={req}
        ticket={ticket}
        members={members}
      />
    )
  }
  return (
    <BoardCardFields
      orgSlug={orgSlug}
      slug={slug}
      ticket={ticket}
      members={members}
      onPatch={noopPatch}
    />
  )
}

function BacklogMutatingCard({
  orgSlug,
  slug,
  req,
  ticket,
  members
}: {
  orgSlug: string
  slug: string
  req: BacklogRequest
  ticket: Ticket
  members: ReadonlyArray<Member>
}) {
  const update = useAtomSet(updateBacklogTicket({ req, id: ticket.id }))
  return (
    <BoardCardFields
      orgSlug={orgSlug}
      slug={slug}
      ticket={ticket}
      members={members}
      onPatch={update}
    />
  )
}

function BoardMutatingCard({
  orgSlug,
  slug,
  req,
  ticket,
  members
}: {
  orgSlug: string
  slug: string
  req: BoardRequest
  ticket: Ticket
  members: ReadonlyArray<Member>
}) {
  const update = useAtomSet(updateBoardTicket({ req, id: ticket.id }))
  return (
    <BoardCardFields
      orgSlug={orgSlug}
      slug={slug}
      ticket={ticket}
      members={members}
      onPatch={update}
    />
  )
}

function BoardCardFields({
  orgSlug,
  slug,
  ticket,
  members,
  onPatch
}: {
  orgSlug: string
  slug: string
  ticket: Ticket
  members: ReadonlyArray<Member>
  onPatch: (patch: UpdateTicketInput) => void
}) {
  return (
    <DeferredDropdownMenus>
      <div className="group/reveal relative isolate flex flex-col gap-2 rounded-sm bg-surface-3 px-1.5 pt-3 pb-1.5 text-left shadow-surface-1 transition outline-none hover:bg-surface-4 hover:shadow-surface-1-hover [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-20 [&_button]:relative [&_button]:z-20">
        <div className="flex min-h-[2lh] items-start gap-1.5 text-[13px] leading-snug">
          <Link
            to="/orgs/$orgSlug/projects/$slug/tickets/$id"
            params={{ orgSlug, slug, id: ticket.id }}
            preload="intent"
            draggable={false}
            data-row-link
            className="min-w-0 font-medium outline-none after:absolute after:inset-0 after:z-10 after:rounded-sm after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
          >
            <span className="line-clamp-2">{ticket.title}</span>
          </Link>
          <div className="order-first mt-[calc((1lh-1.5rem)/2)] shrink-0">
            <TypeButton ticket={ticket} iconOnly onPatch={onPatch} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PriorityButton ticket={ticket} stopPropagation onPatch={onPatch} />
          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
            {ticket.id}
          </span>
          <div className="flex min-w-0 flex-1 items-center">
            <TicketGitChip orgSlug={orgSlug} slug={slug} ticket={ticket} />
          </div>
          <SplitTicketControl
            orgSlug={orgSlug}
            slug={slug}
            id={ticket.id}
            size="icon-xs"
            className="opacity-0 group-focus-within/reveal:opacity-100 group-hover/reveal:opacity-100"
          />
          <AssigneeField
            ticket={ticket}
            members={members}
            variant="card"
            onPatch={onPatch}
          />
        </div>
      </div>
    </DeferredDropdownMenus>
  )
}

const noopPatch = (_patch: UpdateTicketInput) => {}

export const SprintBoardCard = memo(SprintBoardCardImpl)
