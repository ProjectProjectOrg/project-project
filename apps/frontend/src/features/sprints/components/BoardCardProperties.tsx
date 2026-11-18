import { useAtomValue } from "@effect/atom-react"
import {
  type Ticket,
  type TicketParent,
  type TicketPriority,
  isEpic
} from "@pp/shared"
import {
  ChipDots,
  ChipSeparator,
  chipClassName,
  chipNarrowOnlyClass,
  chipWideOnlyClass
} from "@pp/ui/chip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { ChevronRight, Layers } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MiddleTruncate } from "@pp/ui/middle-truncate"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { useState, type ComponentProps, type ReactNode } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { TagMenuBody } from "@/features/tags/components/TagMenuBody"
import { EstimateBadgeTrigger } from "@/features/tickets/components/ticket-list/EstimateField"
import { PriorityMenu } from "@/features/tickets/components/ticket-list/PriorityField"
import {
  FlagChip,
  RelationChips,
  SubTicketsChip
} from "@/features/tickets/components/ticket-preview/PreviewChips"
import {
  TicketPreview,
  TicketPreviewTrigger
} from "@/features/tickets/components/ticket-preview/TicketPreview"
import { useDisplayProperties } from "@/features/tickets/hooks/useDisplayProperties"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { useTicketTagMenu } from "@/features/tickets/hooks/useTicketTagMenu"
import {
  PRIORITY_LABELS,
  PRIORITY_META
} from "@/features/tickets/lib/priorityMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { m } from "@/paraglide/messages"

import { BoardCardGit } from "./BoardCardGit"

const pressChip = chipClassName({ interaction: "press" })
const labelChip = chipClassName({ kind: "label", interaction: "press" })

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
  // One order on every card: the fixed-width chips first, so they stand at
  // the same spot on every card, then the ones as long as their text (epic,
  // tags), which wrap last. Tags past two fold into "+N", previewed on hover.
  return (
    <>
      <PriorityChip
        priority={ticket.priority}
        editable={editable}
        onChange={(priority) => onPatch({ priority })}
      />
      <FlagChip
        ticket={ticket}
        className={chipClassName({
          interaction: "hover",
          shape: "icon",
          className: "w-[22px] [&_svg]:size-3"
        })}
      />
      <ChipSeparator />
      {ticket.estimate !== null &&
        estimation !== "off" &&
        shows("estimate") && (
          <fieldset disabled={!editable} className="contents">
            <EstimateBadgeTrigger
              ticket={ticket}
              mode={estimation}
              onPatch={onPatch}
              variant="compact"
              className={pressChip}
            />
          </fieldset>
        )}
      <BoardSubTicketsChip ticket={ticket} />
      <RelationChips
        ticket={ticket}
        className={chipClassName({ interaction: "hover", shape: "count" })}
      />
      {shows("git") && (
        <BoardCardGit ticket={ticket} chipClassName={pressChip} />
      )}
      {isEpic(ticket.parent) && shows("epic") && (
        <EpicChip epic={ticket.parent} />
      )}
      {shows("tags") && (
        <TagChips
          names={ticket.tags}
          onPatch={editable ? onPatch : undefined}
          max={2}
        />
      )}
      {failure}
    </>
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
          className={chipClassName({ interaction: "press", shape: "icon" })}
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

// Progress previews the sub-tickets on hover, like links preview theirs, also
// while the card lists them, so every chip on the card answers a hover.
function BoardSubTicketsChip({
  ticket
}: Readonly<{
  ticket: Pick<Ticket, "id" | "subTicketCount" | "subTicketDoneCount">
}>) {
  return (
    <SubTicketsChip
      ticket={ticket}
      className={chipClassName({ interaction: "hover" })}
    />
  )
}

function EpicChip({ epic }: Readonly<{ epic: TicketParent }>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <TicketPreviewTrigger
      preview={TicketPreview.ticket({ id: epic.id })}
      render={
        <Link
          to="/orgs/$orgSlug/projects/$slug/tickets/$id"
          params={{ orgSlug, slug, id: epic.id }}
          preload="intent"
          draggable={false}
          className={labelChip}
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
        preview={TicketPreview.ticket({ id: parent.id })}
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

// A ticket's tags: the first `max` as chips, the rest behind "+N". With
// `collapse` (list rows), a narrow list folds them all into one chip of
// dots and a count (chipNarrowOnlyClass).
export function TagChips({
  names,
  onPatch,
  max,
  collapse = false
}: Readonly<{
  names: Ticket["tags"]
  onPatch?: (patch: TicketEdit) => void
  max?: number
  collapse?: boolean
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const tags = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  if (names.length === 0) return null
  const colors = new Map(
    Result.isSuccess(tags) ? tags.value.map((tag) => [tag.name, tag.color]) : []
  )
  const shown = max === undefined ? names : names.slice(0, max)
  const hidden = names.slice(shown.length)
  const wide = collapse ? chipWideOnlyClass : undefined
  const chip = (
    key: string,
    preview: ComponentProps<typeof TicketPreviewTrigger>["preview"],
    content: ReactNode,
    label?: string,
    className?: string
  ) => {
    const button = <button type="button" className={cn(labelChip, className)} />
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
          TicketPreview.tag({ name }),
          <>
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full bg-muted-foreground"
              style={{ backgroundColor: colors.get(name) ?? undefined }}
            />
            <span className="truncate">{name}</span>
          </>,
          undefined,
          wide
        )
      )}
      {hidden.length > 0 &&
        chip(
          "more",
          TicketPreview.tags({ names: hidden }),
          <span className="tabular-nums">
            {m.tags_more({ count: hidden.length })}
          </span>,
          m.tags_more_aria_label({ count: hidden.length }),
          wide
        )}
      {collapse &&
        chip(
          "all",
          TicketPreview.tags({ names }),
          <>
            <ChipDots colors={names.map((name) => colors.get(name))} />
            <span className="tabular-nums">{names.length}</span>
          </>,
          m.tags_count_aria_label({ count: names.length }),
          chipNarrowOnlyClass
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
