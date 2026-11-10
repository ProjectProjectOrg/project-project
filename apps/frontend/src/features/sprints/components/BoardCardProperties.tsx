import { useAtomValue } from "@effect/atom-react"
import {
  hasSubTickets,
  type TicketId,
  type Ticket,
  type TicketPriority,
  type UpdateTicketInput
} from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronRight, Layers } from "lucide-react"
import type { ReactNode } from "react"

import { MiddleTruncate } from "@/components/ui/middle-truncate"
import { Select, SelectTrigger } from "@/components/ui/select"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import {
  ticketDetail,
  ticketRequest
} from "@/features/tickets/atoms/ticketDetail"
import { useParentLabel } from "@/features/tickets/components/ticket-list/EpicLabel"
import { EstimateBadgeTrigger } from "@/features/tickets/components/ticket-list/EstimateField"
import { priorityOptions } from "@/features/tickets/components/ticket-list/PriorityField"
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
  onPatch: (patch: UpdateTicketInput) => void
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
      {ticket.parent && <EpicChip epicId={ticket.parent} />}
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
    <Select
      items={priorityOptions()}
      value={priority}
      disabled={!editable}
      onValueChange={(next) => {
        if (next !== priority) onChange(next)
      }}
      contentProps={{ align: "start", className: "w-40", finalFocus: false }}
    >
      <SelectTrigger
        render={
          <button
            type="button"
            onClick={(event) => event.stopPropagation()}
            aria-label={m.tickets_priority_aria_label({ label })}
            title={label}
            className={cn(
              boardChipClass,
              interactiveChipClass,
              "w-[22px] justify-center px-0"
            )}
          />
        }
      >
        <Icon
          className={cn("size-3 shrink-0", meta.className)}
          strokeWidth={1.75}
        />
      </SelectTrigger>
    </Select>
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

function EpicChip({ epicId }: Readonly<{ epicId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const label = useParentLabel({ orgSlug, slug, epicId })
  if (label?.epic !== true) return null
  return (
    <TicketPreviewTrigger
      preview={{ kind: "ticket", id: epicId }}
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug, slug, id: epicId }}
          preload="intent"
          draggable={false}
          className={cn(boardChipClass, interactiveChipClass)}
        />
      }
    >
      <Layers className="size-3 shrink-0" strokeWidth={1.75} />
      <MiddleTruncate value={label.title} />
    </TicketPreviewTrigger>
  )
}

export function ParentTicketCrumb({
  parentId
}: Readonly<{ parentId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const label = useParentLabel({ orgSlug, slug, epicId: parentId })
  if (label === null || label.epic) return null
  return (
    <>
      <ChevronRight
        aria-hidden
        className="-mx-0.5 size-3.5 shrink-0"
        strokeWidth={1.75}
      />
      <TicketPreviewTrigger
        preview={{ kind: "ticket", id: parentId }}
        render={
          <Link
            to="/orgs/$orgSlug/projects/$slug/tickets/$id"
            params={{ orgSlug, slug, id: parentId }}
            preload="intent"
            draggable={false}
            className="relative z-20 flex min-w-0 transition-colors hover:text-foreground"
          />
        }
      >
        <ParentTitle parentId={parentId} />
      </TicketPreviewTrigger>
    </>
  )
}

function ParentTitle({ parentId }: Readonly<{ parentId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const parent = useAtomValue(
    ticketDetail(ticketRequest(orgSlug, slug, parentId))
  )
  return (
    <span className="min-w-0 truncate">
      {Result.isSuccess(parent) ? parent.value.title : parentId}
    </span>
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
