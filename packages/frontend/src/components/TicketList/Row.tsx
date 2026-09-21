import { memo, useRef, type ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Link } from "@tanstack/react-router"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { updateBacklogTicket, type BacklogRequest } from "@/atoms/backlog"
import { TicketGitChip } from "@/components/TicketGit"
import { TicketHoverCard } from "@/components/TicketHoverCard"
import { DeferredDropdownMenus } from "@/components/ui/dropdown-menu"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import type {
  Group,
  Member,
  Ticket,
  UpdateTicketInput
} from "@projectproject/shared"
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
  previewMounted: boolean
  onPreviewPointerEnter: (ticketId: Ticket["id"]) => void
  onPreviewOpenChange: (ticketId: Ticket["id"], open: boolean) => void
  onPreviewDismiss: () => void
}>

function RowImpl(props: RowProps) {
  if (props.onUpdate) {
    return <RowView {...props} onPatch={props.onUpdate} waiting={false} />
  }
  return <BacklogMutatingRow {...props} />
}

function BacklogMutatingRow(props: RowProps) {
  const update = useAtomSet(
    updateBacklogTicket({ req: props.req, id: props.ticket.id })
  )
  const updateState = useAtomValue(
    updateBacklogTicket({ req: props.req, id: props.ticket.id })
  )
  return <RowView {...props} onPatch={update} waiting={updateState.waiting} />
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
  previewMounted,
  onPreviewPointerEnter,
  onPreviewOpenChange,
  onPreviewDismiss,
  onPatch,
  waiting
}: RowProps & {
  onPatch: (patch: UpdateTicketInput) => void
  waiting: boolean
}) {
  const dashIdx = ticket.id.lastIndexOf("-")
  const idPrefix = dashIdx >= 0 ? ticket.id.slice(0, dashIdx) : ticket.id
  const idTail = dashIdx >= 0 ? ticket.id.slice(dashIdx + 1) : ""
  const rowElement = useRef<HTMLDivElement>(null)
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
            onPreviewOpenChange(ticket.id, nextOpen)
          }}
        >
          <div
            ref={rowElement}
            className={cn(
              "relative isolate col-span-full grid grid-cols-subgrid items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/60 [&_button]:relative [&_button]:z-20 [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-20",
              waiting && "animate-pulse"
            )}
          >
            <Link
              to="/orgs/$orgSlug/projects/$slug/tickets/$id"
              params={{ orgSlug, slug, id: ticket.id }}
              preload="intent"
              data-row-link
              onClick={onPreviewDismiss}
              className="col-start-4 row-start-1 flex min-w-0 self-stretch items-center outline-none after:absolute after:inset-0 after:z-10 after:rounded-lg after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
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
                    className="relative z-20 flex min-w-0 flex-1 self-stretch items-center"
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
              waiting={waiting}
            />
            <PriorityButton
              ticket={ticket}
              stopPropagation
              onPatch={onPatch}
              waiting={waiting}
            />
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
                waiting={waiting}
                className="hidden sm:inline-flex"
              />
            </div>
            <TypeButton
              ticket={ticket}
              onPatch={onPatch}
              waiting={waiting}
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
