import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Member, Ticket, TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { AnimatePresence, motion } from "motion/react"
import { memo, useRef, useState } from "react"

import { DeferredDropdownMenus } from "@/components/ui/dropdown-menu"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { TicketGitChip } from "@/features/github/components/ticket-git/TicketGit"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import { TicketHoverCard } from "@/features/tickets/components/TicketHoverCard"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"

import { AssigneeField } from "./AssigneeField"
import { EpicLink, EpicSeparator, useParentLabel } from "./EpicLabel"
import { EstimateChip } from "./EstimateField"
import { NestTree, type RowNest } from "./NestTree"
import { PriorityButton } from "./PriorityField"
import { TicketRowActions } from "./RowActions"
import { SprintField } from "./SprintField"
import { StatusButton } from "./StatusField"
import { SubTicketMarker } from "./SubTicketMarker"
import { SubTicketProgress } from "./SubTicketProgress"
import { UpdateFailureMarker } from "./UpdateFailureMarker"

const TICKET_PREVIEW_DELAY_MS = 550

export const rowGridClassName =
  "grid gap-y-1 grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto]"

export type RowProps = Readonly<{
  update: TicketUpdates
  variant?: "standalone" | "embedded"
  ticket: Ticket
  members: ReadonlyArray<Member>
  showParent?: boolean
  showSprint?: boolean
  nest?: RowNest
  pending?: boolean
  editable?: boolean
  previewOpen: boolean
  onPreviewPointerEnter: (ticketId: Ticket["id"]) => void
  onPreviewOpenChange: (ticketId: Ticket["id"], open: boolean) => void
}>

function RowImpl({
  update,
  variant = "standalone",
  ticket,
  members,
  showParent = true,
  showSprint = true,
  nest,
  pending,
  editable = true,
  previewOpen,
  onPreviewPointerEnter,
  onPreviewOpenChange
}: RowProps) {
  const { orgSlug, slug } = useProjectRoute()
  const onPatch = useAtomSet(update(ticket.id))
  const dashIdx = ticket.id.lastIndexOf("-")
  const idPrefix = dashIdx >= 0 ? ticket.id.slice(0, dashIdx) : ticket.id
  const idTail = dashIdx >= 0 ? ticket.id.slice(dashIdx + 1) : ""
  const rowElement = useRef<HTMLDivElement>(null)
  const estimation = useEstimationMode()
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
            className={cn(
              "col-span-full grid grid-cols-subgrid items-center gap-x-1.5 px-3 py-2.5 text-left outline-none [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-20 [&_button]:relative [&_button]:z-20",
              variant === "standalone" &&
                "relative isolate rounded-lg transition-colors hover:bg-hover has-[[data-popup-open]]:bg-hover"
            )}
          >
            <NestTree nest={nest} />
            <div className="col-start-4 row-start-1 flex min-w-0 items-center self-stretch pl-1.5">
              {nest === undefined && showParent && ticket.parent && (
                <EpicPrefix epicId={ticket.parent} />
              )}
              <Link
                to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                params={{ orgSlug, slug, id: ticket.id }}
                preload="intent"
                data-row-link
                className="flex min-w-0 items-center self-stretch outline-none after:absolute after:inset-0 after:z-10 after:rounded-lg after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
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
              <SubTicketProgress
                ticket={ticket}
                className="relative z-20 ml-2"
              />
              {nest === undefined && ticket.parent && (
                <SubTicketMarker parentId={ticket.parent} />
              )}
            </div>
            <fieldset disabled={!editable} className="contents">
              <StatusButton ticket={ticket} stopPropagation onPatch={onPatch} />
              <PriorityButton
                ticket={ticket}
                stopPropagation
                onPatch={onPatch}
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
                <UpdateFailureMarker update={update(ticket.id)} />
                <TicketGitChip orgSlug={orgSlug} slug={slug} ticket={ticket} />
                <EstimateChip ticket={ticket} mode={estimation} />
                {showSprint && <RowSprint ticketId={ticket.id} />}
                <AssigneeField
                  ticket={ticket}
                  members={members}
                  onPatch={onPatch}
                  className="hidden sm:inline-flex"
                />
              </div>
            </fieldset>
            <span className="relative z-20 inline-flex shrink-0 items-center">
              <TicketRowActions
                id={ticket.id}
                archived={ticket.archivedAt !== null}
                parent={ticket.parent ?? null}
                onDetach={
                  editable ? () => onPatch({ parent: null }) : undefined
                }
              />
            </span>
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

function RowSprint({ ticketId }: Readonly<{ ticketId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const membership = useAtomValue(
    sprintMembership(sprintListRequest(orgSlug, slug))
  )
  if (!Result.isSuccess(membership) || membership.value.size === 0) return null
  return (
    <SprintField
      variant="responsive"
      ticketId={ticketId}
      membership={membership.value.get(ticketId) ?? null}
    />
  )
}

function EpicPrefix({ epicId }: Readonly<{ epicId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const ref = { orgSlug, slug, epicId }
  if (useParentLabel(ref)?.epic !== true) return null
  return (
    <>
      <EpicLink {...ref} className="text-sm" />
      <EpicSeparator className="shrink-0 text-sm" />
    </>
  )
}

export const Row = memo(RowImpl)
