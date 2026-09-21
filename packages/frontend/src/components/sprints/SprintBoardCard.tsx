import { memo } from "react"
import { DeferredDropdownMenus } from "@/components/ui/dropdown-menu"
import { Link } from "@tanstack/react-router"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { updateBacklogTicket, type BacklogRequest } from "@/atoms/backlog"
import {
  placeBoardTicket,
  updateBoardTicket,
  type BoardRequest
} from "@/atoms/sprintBoard"
import { TicketGitChip } from "@/components/TicketGit"
import { cn } from "@/lib/utils"
import type { Member, Ticket, UpdateTicketInput } from "@projectproject/shared"
import { AssigneeField } from "@/components/TicketList/AssigneeField"
import { PriorityButton } from "@/components/TicketList/PriorityField"
import { SplitTicketControl } from "@/components/TicketList/SplitControl"
import { TypeButton } from "@/components/TicketList/TypeField"

function SprintBoardCardImpl({
  orgSlug,
  slug,
  req,
  backlogReq,
  ticket,
  members
}: {
  orgSlug: string
  slug: string
  req?: BoardRequest
  backlogReq?: BacklogRequest
  ticket: Ticket
  members: ReadonlyArray<Member>
}) {
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
      waiting={false}
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
  const updateState = useAtomValue(updateBacklogTicket({ req, id: ticket.id }))
  return (
    <BoardCardFields
      orgSlug={orgSlug}
      slug={slug}
      ticket={ticket}
      members={members}
      onPatch={update}
      waiting={updateState.waiting}
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
  const updateState = useAtomValue(updateBoardTicket({ req, id: ticket.id }))
  const placeState = useAtomValue(placeBoardTicket({ req, id: ticket.id }))
  return (
    <BoardCardFields
      orgSlug={orgSlug}
      slug={slug}
      ticket={ticket}
      members={members}
      onPatch={update}
      waiting={updateState.waiting || placeState.waiting}
    />
  )
}

function BoardCardFields({
  orgSlug,
  slug,
  ticket,
  members,
  onPatch,
  waiting
}: {
  orgSlug: string
  slug: string
  ticket: Ticket
  members: ReadonlyArray<Member>
  onPatch: (patch: UpdateTicketInput) => void
  waiting: boolean
}) {
  return (
    <DeferredDropdownMenus>
      <div
        className={cn(
          "group/reveal relative isolate flex flex-col gap-2 rounded-sm bg-surface-3 px-1.5 pt-3 pb-1.5 text-left shadow-surface-1 outline-none transition hover:bg-surface-4 hover:shadow-surface-1-hover [&_button]:relative [&_button]:z-20 [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-20",
          waiting && "animate-pulse"
        )}
      >
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
            <TypeButton
              ticket={ticket}
              iconOnly
              onPatch={onPatch}
              waiting={waiting}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PriorityButton
            ticket={ticket}
            stopPropagation
            onPatch={onPatch}
            waiting={waiting}
          />
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
            className="opacity-0 group-hover/reveal:opacity-100 group-focus-within/reveal:opacity-100"
          />
          <AssigneeField
            ticket={ticket}
            members={members}
            variant="card"
            onPatch={onPatch}
            waiting={waiting}
          />
        </div>
      </div>
    </DeferredDropdownMenus>
  )
}

const noopPatch = (_patch: UpdateTicketInput) => {}

export const SprintBoardCard = memo(SprintBoardCardImpl)
