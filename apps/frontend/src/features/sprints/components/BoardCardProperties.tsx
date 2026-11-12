import { useAtomValue } from "@effect/atom-react"
import {
  hasSubTickets,
  type Ticket,
  type TicketParent,
  type TicketPriority,
  isEpic
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronRight, Layers } from "lucide-react"
import type { ReactNode } from "react"

import { MiddleTruncate } from "@/components/ui/middle-truncate"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { EstimateBadgeTrigger } from "@/features/tickets/components/ticket-list/EstimateField"
import { PriorityMenu } from "@/features/tickets/components/ticket-list/PriorityField"
import { SubTicketCount } from "@/features/tickets/components/ticket-list/SubTicketProgress"
import {
  RelationChips,
  SubTicketsChip
} from "@/features/tickets/components/ticket-preview/PreviewChips"
import { TicketPreviewTrigger } from "@/features/tickets/components/ticket-preview/TicketPreview"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { useSubTicketsExpanded } from "@/features/tickets/hooks/useSubTicketsExpanded"
import {
  PRIORITY_LABELS,
  PRIORITY_META
} from "@/features/tickets/lib/priorityMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BoardCardGit } from "./BoardCardGit"

export const boardChipClass =
  "inline-flex h-[22px] max-w-48 min-w-0 shrink-0 items-center gap-1 rounded-full px-1.5 text-caption text-muted-foreground inset-ring inset-ring-border/60"

const hoverChipClass =
  "transition-colors outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[popup-open]:bg-hover data-[popup-open]:text-foreground"

export const interactiveChipClass = cn("cursor-pointer", hoverChipClass)

export function BoardCardProperties({
  ticket,
  editable,
  onPatch,
  failure
}: Readonly<{
  ticket: Ticket
  editable: boolean
  onPatch: (patch: TicketEdit) => void
  failure: ReactNode
}>) {
  const estimation = useEstimationMode()
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 [&:not(:has(>:not(:empty)))]:hidden [&>:empty]:hidden">
      <PriorityChip
        priority={ticket.priority}
        editable={editable}
        onChange={(priority) => onPatch({ priority })}
      />
      <BoardSubTicketsChip ticket={ticket} />
      <RelationChips
        ticket={ticket}
        className={cn(
          boardChipClass,
          hoverChipClass,
          "min-w-[22px] justify-center px-[5px] [&_svg]:size-3"
        )}
      />
      {isEpic(ticket.parent) && <EpicChip epic={ticket.parent} />}
      {ticket.estimate !== null && estimation !== "off" && (
        <fieldset disabled={!editable} className="contents">
          <EstimateBadgeTrigger
            ticket={ticket}
            mode={estimation}
            onPatch={onPatch}
            className={cn(boardChipClass, interactiveChipClass, "gap-1")}
          />
        </fieldset>
      )}
      <TagChips names={ticket.tags} />
      <BoardCardGit
        ticket={ticket}
        chipClassName={cn(boardChipClass, interactiveChipClass)}
      />
      {failure}
    </div>
  )
}

function PriorityChip({
  priority,
  editable,
  onChange
}: Readonly<{
  priority: TicketPriority
  editable: boolean
  onChange: (priority: TicketPriority) => void
}>) {
  const meta = PRIORITY_META[priority]
  const Icon = meta.icon
  const label = PRIORITY_LABELS[priority]()
  return (
    <PriorityMenu
      value={priority}
      disabled={!editable}
      onChange={onChange}
      className="w-40"
      trigger={
        <button
          type="button"
          disabled={!editable}
          onClick={(event) => event.stopPropagation()}
          aria-label={m.tickets_priority_aria_label({ label })}
          title={label}
          className={cn(
            boardChipClass,
            interactiveChipClass,
            "w-[22px] justify-center px-0"
          )}
        >
          <Icon
            className={cn("size-3 shrink-0", meta.className)}
            strokeWidth={1.75}
          />
        </button>
      }
    />
  )
}

function BoardSubTicketsChip({
  ticket
}: Readonly<{
  ticket: Pick<Ticket, "id" | "subTicketCount" | "subTicketDoneCount">
}>) {
  const [expanded] = useSubTicketsExpanded()
  if (!expanded) {
    return (
      <SubTicketsChip
        ticket={ticket}
        className={cn(boardChipClass, hoverChipClass)}
      />
    )
  }
  if (!hasSubTickets(ticket)) return null
  const done = ticket.subTicketDoneCount ?? 0
  const total = ticket.subTicketCount ?? 0
  return (
    <SubTicketCount
      done={done}
      total={total}
      title={m.tickets_sub_tickets_progress({ done, total })}
      className={boardChipClass}
    />
  )
}

function EpicChip({ epic }: Readonly<{ epic: TicketParent }>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <TicketPreviewTrigger
      preview={{ kind: "ticket", id: epic.id }}
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug, slug, id: epic.id }}
          preload="intent"
          draggable={false}
          className={cn(boardChipClass, interactiveChipClass)}
        />
      }
    >
      <Layers className="size-3 shrink-0" strokeWidth={1.75} />
      <MiddleTruncate value={epic.title} />
    </TicketPreviewTrigger>
  )
}

export function ParentTicketCrumb({
  parent
}: Readonly<{ parent: TicketParent }>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <>
      <ChevronRight
        aria-hidden
        className="-mx-0.5 size-3.5 shrink-0 self-center"
        strokeWidth={1.75}
      />
      <TicketPreviewTrigger
        preview={{ kind: "ticket", id: parent.id }}
        render={
          <Link
            to="/orgs/$orgSlug/projects/$slug/tickets/$id"
            params={{ orgSlug, slug, id: parent.id }}
            preload="intent"
            draggable={false}
            className="relative z-20 -mx-1.5 -my-1 flex min-w-0 rounded-md px-1.5 py-1 transition-colors outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
        }
      >
        <span className="min-w-0 truncate">{parent.title}</span>
      </TicketPreviewTrigger>
    </>
  )
}

function TagChips({ names }: Readonly<{ names: Ticket["tags"] }>) {
  const { orgSlug, slug } = useProjectRoute()
  const tags = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  if (names.length === 0) return null
  const colors = new Map(
    Result.isSuccess(tags) ? tags.value.map((tag) => [tag.name, tag.color]) : []
  )
  return names.map((name) => (
    <span key={name} className={boardChipClass}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-muted-foreground"
        style={{ backgroundColor: colors.get(name) ?? undefined }}
      />
      <span className="truncate">{name}</span>
    </span>
  ))
}
