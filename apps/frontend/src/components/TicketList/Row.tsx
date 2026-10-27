import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Member, Ticket, TicketId, UpdateTicketInput } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { AnimatePresence, motion } from "motion/react"
import { memo, useRef, useState } from "react"

import { TicketGitChip } from "@/components/TicketGit"
import { TicketHoverCard } from "@/components/TicketHoverCard"
import { DeferredDropdownMenus } from "@/components/ui/dropdown-menu"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import {
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import {
  updateBacklogTicket,
  type BacklogRequest
} from "@/features/tickets/atoms/backlog"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"

import { AssigneeField } from "./AssigneeField"
import { EpicLink, EpicSeparator, useEpicTitle } from "./EpicLabel"
import { PriorityButton } from "./PriorityField"
import { TicketRowActions } from "./RowActions"
import { SprintField } from "./SprintField"
import { StatusButton } from "./StatusField"

const TICKET_PREVIEW_DELAY_MS = 550

export const rowGridClassName =
  "grid gap-y-1 grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto]"

type RowPatchSource =
  | Readonly<{
      onUpdate: (patch: UpdateTicketInput) => void
      req?: BacklogRequest
    }>
  | Readonly<{ onUpdate?: undefined; req: BacklogRequest }>

type RowProps = RowPatchSource &
  Readonly<{
    variant?: "standalone" | "embedded"
    orgSlug: string
    slug: string
    ticket: Ticket
    members: ReadonlyArray<Member>
    showParent?: boolean
    pending?: boolean
    previewOpen: boolean
    onPreviewPointerEnter: (ticketId: Ticket["id"]) => void
    onPreviewOpenChange: (ticketId: Ticket["id"], open: boolean) => void
  }>

function RowImpl(props: RowProps) {
  if (props.onUpdate) {
    return <RowView {...props} onPatch={props.onUpdate} />
  }
  return <BacklogMutatingRow {...props} req={props.req} />
}

function BacklogMutatingRow(
  props: RowProps & Readonly<{ req: BacklogRequest }>
) {
  const update = useAtomSet(
    updateBacklogTicket({ req: props.req, id: props.ticket.id })
  )
  return <RowView {...props} onPatch={update} />
}

function RowView({
  variant = "standalone",
  orgSlug,
  slug,
  ticket,
  members,
  showParent = true,
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
            className={cn(
              "col-span-full grid grid-cols-subgrid items-center gap-3 px-3 py-2.5 text-left outline-none [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-20 [&_button]:relative [&_button]:z-20",
              variant === "standalone" &&
                "relative isolate rounded-lg transition-colors hover:bg-muted/60"
            )}
          >
            <div className="col-start-4 row-start-1 flex min-w-0 items-center self-stretch">
              {showParent && ticket.parent && (
                <EpicPrefix
                  orgSlug={orgSlug}
                  slug={slug}
                  epicId={ticket.parent}
                />
              )}
              <Link
                to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                params={{ orgSlug, slug, id: ticket.id }}
                preload="intent"
                data-row-link
                className="flex min-w-0 flex-1 items-center self-stretch outline-none after:absolute after:inset-0 after:z-10 after:rounded-lg after:content-[''] focus-visible:after:ring-1 focus-visible:after:ring-ring focus-visible:after:ring-inset"
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
            </div>
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
              <RowSprint orgSlug={orgSlug} slug={slug} ticketId={ticket.id} />
              <AssigneeField
                ticket={ticket}
                members={members}
                onPatch={onPatch}
                className="hidden sm:inline-flex"
              />
            </div>
            <span className="relative z-20 inline-flex shrink-0 items-center">
              <TicketRowActions
                orgSlug={orgSlug}
                slug={slug}
                id={ticket.id}
                archived={ticket.archivedAt !== null}
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

function RowSprint({
  orgSlug,
  slug,
  ticketId
}: Readonly<{ orgSlug: string; slug: string; ticketId: TicketId }>) {
  const membership = useAtomValue(
    sprintMembership(sprintListRequest(orgSlug, slug))
  )
  if (!Result.isSuccess(membership) || membership.value.size === 0) return null
  return (
    <SprintField
      variant="responsive"
      orgSlug={orgSlug}
      slug={slug}
      ticketId={ticketId}
      membership={membership.value.get(ticketId) ?? null}
    />
  )
}

function EpicPrefix(
  ref: Readonly<{ orgSlug: string; slug: string; epicId: TicketId }>
) {
  if (useEpicTitle(ref) === null) return null
  return (
    <>
      <EpicLink {...ref} className="text-sm" />
      <EpicSeparator className="shrink-0 text-sm" />
    </>
  )
}

export const Row = memo(RowImpl)
