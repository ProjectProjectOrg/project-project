import { useAtomSet } from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import type { Member, Ticket, UpdateTicketInput } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { memo, type ReactNode } from "react"

import { DeferredDropdownMenus } from "@/components/ui/dropdown-menu"
import { TicketGitChip } from "@/features/github/components/ticket-git/TicketGit"
import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import { AssigneeField } from "@/features/tickets/components/ticket-list/AssigneeField"
import { EstimateChip } from "@/features/tickets/components/ticket-list/EstimateField"
import { PriorityButton } from "@/features/tickets/components/ticket-list/PriorityField"
import { SplitTicketControl } from "@/features/tickets/components/ticket-list/SplitControl"
import { TypeButton } from "@/features/tickets/components/ticket-list/TypeField"
import { UpdateFailureMarker } from "@/features/tickets/components/ticket-list/UpdateFailureMarker"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { useProjectActor } from "@/lib/access"

function SprintBoardCardImpl({
  orgSlug,
  slug,
  update,
  ticket,
  members
}: Readonly<{
  orgSlug: string
  slug: string
  update: TicketUpdates
  ticket: Ticket
  members: ReadonlyArray<Member>
}>) {
  const onPatch = useAtomSet(update(ticket.id))
  return (
    <BoardCardFields
      orgSlug={orgSlug}
      slug={slug}
      ticket={ticket}
      members={members}
      onPatch={onPatch}
      failure={<UpdateFailureMarker update={update(ticket.id)} />}
    />
  )
}

function BoardCardFields({
  orgSlug,
  slug,
  ticket,
  members,
  onPatch,
  failure
}: Readonly<{
  orgSlug: string
  slug: string
  ticket: Ticket
  members: ReadonlyArray<Member>
  onPatch: (patch: UpdateTicketInput) => void
  failure: ReactNode
}>) {
  const actor = useProjectActor()
  const editable = TicketPolicy.canChange(actor, { content: true })
  const canAssign = TicketPolicy.canChange(actor, { assignees: true })
  const estimation = useEstimationMode()
  return (
    <DeferredDropdownMenus>
      <div className="group/reveal relative isolate flex flex-col gap-2 rounded-sm bg-surface-3 px-1.5 pt-3 pb-1.5 text-left shadow-surface-1 transition outline-none hover:bg-surface-4 hover:shadow-surface-1-hover has-[[data-popup-open]]:bg-surface-4 has-[[data-popup-open]]:shadow-surface-1-hover [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-20 [&_button]:relative [&_button]:z-20">
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
          <div className="order-first mt-[calc((1lh-2rem)/2)] shrink-0">
            <fieldset disabled={!editable} className="contents">
              <TypeButton ticket={ticket} iconOnly onPatch={onPatch} />
            </fieldset>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <fieldset disabled={!editable} className="contents">
            <PriorityButton ticket={ticket} stopPropagation onPatch={onPatch} />
          </fieldset>
          <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
            {ticket.id}
          </span>
          {failure}
          <EstimateChip ticket={ticket} mode={estimation} />
          <div className="flex min-w-0 flex-1 items-center">
            <TicketGitChip orgSlug={orgSlug} slug={slug} ticket={ticket} />
          </div>
          {editable && actor.call("tickets", "split") && (
            <SplitTicketControl
              orgSlug={orgSlug}
              slug={slug}
              id={ticket.id}
              size="icon-xs"
              className="opacity-0 group-focus-within/reveal:opacity-100 group-hover/reveal:opacity-100 group-has-[[data-popup-open]]/reveal:opacity-100"
            />
          )}
          <fieldset disabled={!canAssign} className="contents">
            <AssigneeField
              ticket={ticket}
              members={members}
              variant="card"
              onPatch={onPatch}
            />
          </fieldset>
        </div>
      </div>
    </DeferredDropdownMenus>
  )
}

export const SprintBoardCard = memo(SprintBoardCardImpl)
