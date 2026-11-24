import { useAtomValue } from "@effect/atom-react"
import {
  type Ticket,
  type TicketParent,
  type TicketPriority,
  isEpic
} from "@pp/shared"
import { Chip, ChipDots, ChipSeparator } from "@pp/ui/chip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { ChevronRight, Layers, Tag } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MiddleTruncate } from "@pp/ui/middle-truncate"
import { TextLink } from "@pp/ui/text-link"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import {
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode
} from "react"

import { richChipColors } from "@/features/auth/atoms/auth"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { TagChip } from "@/features/tags/components/TagChip"
import { TagMenuBody } from "@/features/tags/components/TagMenuBody"
import { EstimateBadgeTrigger } from "@/features/tickets/components/ticket-list/EstimateField"
import { PriorityMenu } from "@/features/tickets/components/ticket-list/PriorityField"
import {
  FlagChip,
  RelationChips,
  SubTicketsChip
} from "@/features/tickets/components/ticket-preview/PreviewChips"
import { TicketPreviewTrigger } from "@/features/tickets/components/ticket-preview/TicketPreview"
import { useDisplayProperties } from "@/features/tickets/hooks/useDisplayProperties"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { useTicketTagMenu } from "@/features/tickets/hooks/useTicketTagMenu"
import {
  PRIORITY_LABELS,
  PRIORITY_META
} from "@/features/tickets/lib/priorityMeta"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { TicketPreview } from "@/features/tickets/lib/ticketPreview"
import { m } from "@/paraglide/messages"

import { BoardCardGit } from "./BoardCardGit"

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
      <FlagChip ticket={ticket} className="w-5.5" />
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
            />
          </fieldset>
        )}
      <SubTicketsChip ticket={ticket} />
      <RelationChips ticket={ticket} />
      {shows("git") && <BoardCardGit ticket={ticket} />}
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
        <Chip
          interaction="press"
          shape="icon"
          disabled={!editable}
          onClick={(event) => event.stopPropagation()}
          aria-label={m.tickets_priority_aria_label({ label })}
          title={label}
        >
          <Icon
            className={cn("size-3 shrink-0", meta.className)}
            strokeWidth={1.75}
          />
        </Chip>
      }
    />
  )
}

function EpicChip({ epic }: Readonly<{ epic: TicketParent }>) {
  const { orgSlug, slug } = useProjectRoute()
  return (
    <TicketPreviewTrigger
      preview={TicketPreview.ticket({ id: epic.id })}
      render={
        <Chip
          kind="label"
          interaction="press"
          render={
            <Link
              to="/orgs/$orgSlug/projects/$slug/tickets/$id"
              params={{ orgSlug, slug, id: epic.id }}
              preload="intent"
              draggable={false}
            />
          }
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
          <TextLink
            className="relative z-20 flex min-w-0"
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                params={{ orgSlug, slug, id: parent.id }}
                preload="intent"
                draggable={false}
              />
            }
          />
        }
      >
        <span className="min-w-0 truncate">{parent.title}</span>
      </TicketPreviewTrigger>
    </>
  )
}

// The neutral chip behind "+N" and the folded dots on a narrow list.
const labelChip = (show: ComponentProps<typeof Chip>["show"]) => (
  <Chip kind="label" interaction="press" show={show} />
)

// A ticket's tags: the first `max` as chips, the rest behind "+N". With
// `collapse` (list rows), a narrow list folds them all into one chip of
// dots and a count.
export function TagChips({
  names,
  onPatch,
  max,
  collapse = false,
  placeholder
}: Readonly<{
  names: Ticket["tags"]
  onPatch?: (patch: TicketEdit) => void
  max?: number
  collapse?: boolean
  // With no labels, an empty chip that adds one ("Label"): a selected row
  // shows every field, so you can see where each goes.
  placeholder?: string
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const tags = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  const rich = useAtomValue(richChipColors)
  if (names.length === 0)
    return placeholder !== undefined && onPatch ? (
      <TagChipMenu applied={names} onPatch={onPatch}>
        <DropdownMenuTrigger render={<Chip interaction="press" />}>
          <Tag className="size-3 shrink-0" strokeWidth={1.75} />
          {placeholder}
        </DropdownMenuTrigger>
      </TagChipMenu>
    ) : null
  const colors = new Map(
    Result.isSuccess(tags) ? tags.value.map((tag) => [tag.name, tag.color]) : []
  )
  const shown = max === undefined ? names : names.slice(0, max)
  const hidden = names.slice(shown.length)
  const chip = (
    key: string,
    preview: ComponentProps<typeof TicketPreviewTrigger>["preview"],
    content: ReactNode,
    ariaLabel: string | undefined,
    button: ReactElement
  ) =>
    onPatch ? (
      <TagChipMenu key={key} applied={names} onPatch={onPatch}>
        <TicketPreviewTrigger
          preview={preview}
          aria-label={ariaLabel}
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
        aria-label={ariaLabel}
        render={button}
      >
        {content}
      </TicketPreviewTrigger>
    )
  return (
    <>
      {shown.map((name) =>
        rich
          ? chip(
              name,
              TicketPreview.tag({ name }),
              <span className="truncate">{name}</span>,
              undefined,
              <TagChip
                color={colors.get(name)}
                render={<button type="button" />}
                className={
                  collapse ? "hidden min-w-0 @3xl/list:inline-flex" : "min-w-0"
                }
              />
            )
          : chip(
              name,
              TicketPreview.tag({ name }),
              <>
                <ChipDots colors={[colors.get(name)]} />
                <span className="truncate">{name}</span>
              </>,
              undefined,
              labelChip(collapse ? "wide" : "always")
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
          labelChip(collapse ? "wide" : "always")
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
          labelChip("narrow")
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
