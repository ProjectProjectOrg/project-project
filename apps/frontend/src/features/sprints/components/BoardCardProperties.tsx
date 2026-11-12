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
import { useState, type ComponentProps, type ReactNode } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { MiddleTruncate } from "@/components/ui/middle-truncate"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { TagMenuBody } from "@/features/tags/components/TagMenuBody"
import { EstimateBadgeTrigger } from "@/features/tickets/components/ticket-list/EstimateField"
import { PriorityMenu } from "@/features/tickets/components/ticket-list/PriorityField"
import { SubTicketCount } from "@/features/tickets/components/ticket-list/SubTicketProgress"
import {
  FlagChip,
  RelationChips,
  SubTicketsChip
} from "@/features/tickets/components/ticket-preview/PreviewChips"
import { TicketPreviewTrigger } from "@/features/tickets/components/ticket-preview/TicketPreview"
import { useDisplayProperties } from "@/features/tickets/hooks/useDisplayProperties"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { useSubTicketsExpanded } from "@/features/tickets/hooks/useSubTicketsExpanded"
import { useTicketTagMenu } from "@/features/tickets/hooks/useTicketTagMenu"
import {
  PRIORITY_LABELS,
  PRIORITY_META
} from "@/features/tickets/lib/priorityMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { BoardCardGit } from "./BoardCardGit"

export const boardChipClass =
  "inline-flex h-6 max-w-48 min-w-0 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-caption text-muted-foreground inset-ring inset-ring-border/60"

const hoverChipClass =
  "transition-colors outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[popup-open]:bg-hover data-[popup-open]:text-foreground"

export const interactiveChipClass = cn("cursor-pointer", hoverChipClass)

export const relationChipClass = cn(
  boardChipClass,
  hoverChipClass,
  "min-w-6 justify-center gap-1 px-1.5 [&_svg]:size-3"
)

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
  const { shows } = useDisplayProperties()
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1 [&:not(:has(>:not(:empty)))]:hidden [&>:empty]:hidden">
      <FlagChip
        ticket={ticket}
        className={cn(
          boardChipClass,
          hoverChipClass,
          "w-[22px] justify-center px-0 [&_svg]:size-3"
        )}
      />
      <PriorityChip
        priority={ticket.priority}
        editable={editable}
        onChange={(priority) => onPatch({ priority })}
      />
      <BoardSubTicketsChip ticket={ticket} />
      {shows("tags") && (
        <TagChips
          names={ticket.tags}
          onPatch={editable ? onPatch : undefined}
        />
      )}
      {shows("git") && (
        <BoardCardGit
          ticket={ticket}
          chipClassName={cn(boardChipClass, interactiveChipClass)}
        />
      )}
      <RelationChips ticket={ticket} className={relationChipClass} />
      {isEpic(ticket.parent) && shows("epic") && (
        <EpicChip epic={ticket.parent} />
      )}
      {ticket.estimate !== null &&
        estimation !== "off" &&
        shows("estimate") && (
          <fieldset disabled={!editable} className="contents">
            <EstimateBadgeTrigger
              ticket={ticket}
              mode={estimation}
              onPatch={onPatch}
              className={cn(boardChipClass, interactiveChipClass)}
            />
          </fieldset>
        )}
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
            "w-6 justify-center px-0"
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

export function TagChips({
  names,
  onPatch,
  max
}: Readonly<{
  names: Ticket["tags"]
  onPatch?: (patch: TicketEdit) => void
  max?: number
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const tags = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  if (names.length === 0) return null
  const colors = new Map(
    Result.isSuccess(tags) ? tags.value.map((tag) => [tag.name, tag.color]) : []
  )
  const shown = max === undefined ? names : names.slice(0, max)
  const hidden = names.slice(shown.length)
  const chip = (
    key: string,
    preview: ComponentProps<typeof TicketPreviewTrigger>["preview"],
    content: ReactNode,
    label?: string
  ) => {
    const button = (
      <button
        type="button"
        className={cn(boardChipClass, interactiveChipClass)}
      />
    )
    return onPatch ? (
      <TagChipMenu key={key} applied={names} onPatch={onPatch}>
        <TicketPreviewTrigger
          preview={preview}
          aria-label={label}
          aria-haspopup="menu"
          onClick={undefined}
          render={<DropdownMenuTrigger render={button} />}
        >
          {content}
        </TicketPreviewTrigger>
      </TagChipMenu>
    ) : (
      <TicketPreviewTrigger
        key={key}
        preview={preview}
        aria-label={label}
        render={button}
      >
        {content}
      </TicketPreviewTrigger>
    )
  }
  return (
    <>
      {shown.map((name) =>
        chip(
          name,
          { kind: "tag", name },
          <>
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-muted-foreground"
              style={{ backgroundColor: colors.get(name) ?? undefined }}
            />
            <span className="truncate">{name}</span>
          </>
        )
      )}
      {hidden.length > 0 &&
        chip(
          "more",
          { kind: "tags", names: hidden },
          <span className="tabular-nums">
            {m.tags_more({ count: hidden.length })}
          </span>,
          m.tags_more_aria_label({ count: hidden.length })
        )}
    </>
  )
}

function TagChipMenu({
  applied,
  onPatch,
  children
}: Readonly<{
  applied: Ticket["tags"]
  onPatch: (patch: TicketEdit) => void
  children: ReactNode
}>) {
  const menu = useTicketTagMenu(applied, onPatch)
  const [anchor, setAnchor] =
    useState<ComponentProps<typeof DropdownMenuContent>["anchor"]>()
  return (
    <DropdownMenu
      filterable={menu.filterable}
      onOpenChange={(open, { trigger }) => {
        menu.onOpenChange(open)
        if (!open || !trigger) return
        const bounds = trigger.getBoundingClientRect()
        setAnchor({ getBoundingClientRect: () => bounds })
      }}
    >
      {children}
      <DropdownMenuContent
        anchor={anchor}
        align="start"
        sideOffset={6}
        className="w-56"
        finalFocus={false}
        onClick={(event) => event.stopPropagation()}
      >
        <TagMenuBody {...menu.body} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
