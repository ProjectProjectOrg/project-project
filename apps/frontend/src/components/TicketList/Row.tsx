import { useAtomSet } from "@effect/atom-react"
import type { Group, Member, Ticket, UpdateTicketInput } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { memo, useRef, useState, type ReactNode } from "react"

import { TicketGitChip } from "@/components/TicketGit"
import { TicketHoverCard } from "@/components/TicketHoverCard"
import { DeferredDropdownMenus } from "@/components/ui/dropdown-menu"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import {
  updateBacklogTicket,
  type BacklogRequest
} from "@/features/tickets/atoms/backlog"
import { transitions } from "@/lib/springs"

import { AssigneeField } from "./AssigneeField"
import { PriorityButton } from "./PriorityField"
import { SprintField } from "./SprintField"
import { StatusButton } from "./StatusField"
import { TypeButton } from "./TypeField"

const TICKET_PREVIEW_DELAY_MS = 550

type RowProps = Readonly<{
  onUpdate?: (patch: UpdateTicketInput) => void
  orgSlug: string
  slug: string
  ticket: Ticket
  req: BacklogRequest
  members: ReadonlyArray<Member>
  showSprintCol: boolean
  showExtraActionsCol: boolean
  sprintMembership: Group | null
  extraRowActions?: (ticket: Ticket) => ReactNode
  pending?: boolean
  previewOpen: boolean
  onPreviewPointerEnter: (ticketId: Ticket["id"]) => void
  onPreviewOpenChange: (ticketId: Ticket["id"], open: boolean) => void
}>

function RowImpl(props: RowProps) {
  if (props.onUpdate) {
    return <RowView {...props} onPatch={props.onUpdate} />
  }
  return <BacklogMutatingRow {...props} />
}

function BacklogMutatingRow(props: RowProps) {
  const update = useAtomSet(
    updateBacklogTicket({ req: props.req, id: props.ticket.id })
  )
  return <RowView {...props} onPatch={update} />
}

function RowView({
  orgSlug,
  slug,
  ticket,
  members,
  showSprintCol,
  showExtraActionsCol,
  sprintMembership,
  extraRowActions,
  pending,
  previewOpen,
  onPreviewPointerEnter,
  onPreviewOpenChange,
  onPatch
}: RowProps & {
  onPatch: (patch: UpdateTicketInput) => void
}) {
  const dashIdx = ticket.id.lastIndexOf("-")
  const idPrefix = dashIdx >= 0 ? ticket.id.slice(0, dashIdx) : ticket.id
  const idTail = dashIdx >= 0 ? ticket.id.slice(dashIdx + 1) : ""
  const rowElement = useRef<HTMLDivElement>(null)
  const [previewMounted, setPreviewMounted] = useState(false)
  const handleTitlePointerEnter = () => {
    onPreviewPointerEnter(ticket.id)
  }
  const handleTitlePointerLeave = () => {
    onPreviewOpenChange(ticket.id, false)
  }
  return (
    <div className="group/list-row col-span-full grid grid-cols-subgrid">
      <DeferredDropdownMenus>
        <Popover
          open={previewOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen) setPreviewMounted(true)
            onPreviewOpenChange(ticket.id, nextOpen)
          }}
        >
          <div
            ref={rowElement}
            className="relative isolate col-span-full grid grid-cols-subgrid items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted/60 [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-20 [&_button]:relative [&_button]:z-20"
          >
            <Link
              to="/orgs/$orgSlug/projects/$slug/tickets/$id"
              params={{ orgSlug, slug, id: ticket.id }}
              preload="intent"
              data-row-link
              className="col-start-4 row-start-1 flex min-w-0 items-center self-stretch outline-none after:absolute after:inset-0 after:z-10 after:rounded-lg after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
            >
              <PopoverTrigger
                openOnHover
                delay={TICKET_PREVIEW_DELAY_MS}
                nativeButton={false}
                onPointerEnter={handleTitlePointerEnter}
                onPointerLeave={handleTitlePointerLeave}
                render={(triggerProps) => (
                  <div
                    {...triggerProps}
                    role={undefined}
                    tabIndex={undefined}
                    aria-controls={undefined}
                    aria-expanded={undefined}
                    aria-haspopup={undefined}
                    onClick={undefined}
                    onKeyDown={undefined}
                    onKeyUp={undefined}
                    onPointerDown={undefined}
                    className="relative z-20 flex min-w-0 flex-1 items-center self-stretch"
                  />
                )}
              >
                <span className="min-w-0 truncate text-sm font-medium">
                  {ticket.title}
                </span>
              </PopoverTrigger>
            </Link>
            <StatusButton
              orgSlug={orgSlug}
              slug={slug}
              ticket={ticket}
              stopPropagation
              onPatch={onPatch}
            />
            <PriorityButton ticket={ticket} stopPropagation onPatch={onPatch} />
            <span className="inline-flex shrink-0 items-center font-mono text-xs text-muted-foreground tabular-nums">
              <span>{idPrefix}-</span>
              <AnimatePresence initial={false} mode="popLayout">
                {!pending && (
                  <motion.span
                    key={idTail}
                    initial={{ opacity: 0, filter: "blur(4px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, filter: "blur(4px)" }}
                    transition={transitions.presence}
                    className="inline-block"
                  >
                    {idTail}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <TicketGitChip orgSlug={orgSlug} slug={slug} ticket={ticket} />
              {showSprintCol && (
                <SprintField
                  variant="responsive"
                  orgSlug={orgSlug}
                  slug={slug}
                  ticketId={ticket.id}
                  membership={sprintMembership}
                />
              )}
              <AssigneeField
                ticket={ticket}
                members={members}
                onPatch={onPatch}
                className="hidden sm:inline-flex"
              />
            </div>
            <TypeButton
              ticket={ticket}
              onPatch={onPatch}
              className="hidden sm:inline-flex"
            />
            {showExtraActionsCol && (
              <span className="relative z-20 inline-flex shrink-0 items-center">
                {extraRowActions?.(ticket)}
              </span>
            )}
          </div>
          {previewMounted && (
            <TicketHoverCard
              ticketId={ticket.id}
              scope={{ orgSlug, slug, members }}
              anchor={rowElement}
              interactive={false}
            />
          )}
        </Popover>
      </DeferredDropdownMenus>
    </div>
  )
}

export const Row = memo(RowImpl)
