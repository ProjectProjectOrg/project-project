import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import {
  ArrowUp,
  ArrowDown,
  ChevronDown,
  SlidersHorizontal
} from "lucide-react"
import { useRef, useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { CollapsingLabel } from "@/components/ui/collapsing-label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import {
  DISPLAY_PROPERTIES,
  useDisplayProperties,
  type DisplayProperty
} from "@/features/tickets/hooks/useDisplayProperties"
import { useSubTicketsExpanded } from "@/features/tickets/hooks/useSubTicketsExpanded"
import { m } from "@/paraglide/messages"

import { SORT_FIELD_LABELS, sortKeysFor } from "../sort"
import { BoardColumnsPicker } from "./BoardColumnsPicker"
import { useTicketToolbar } from "./context"
import { OptionPicker, ToolbarButton } from "./shared"

export function ViewOptions({ showSort }: Readonly<{ showSort: boolean }>) {
  const { viewControls, boardScope, searchActive: compact } = useTicketToolbar()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] =
    useState<ComponentProps<typeof PopoverContent>["anchor"]>()

  return (
    <Popover
      onOpenChange={(open) => {
        const trigger = triggerRef.current
        if (!open || !trigger) return
        const bounds = trigger.getBoundingClientRect()
        setAnchor({
          getBoundingClientRect: () => bounds,
          contextElement: trigger
        })
      }}
    >
      <PopoverTrigger
        ref={triggerRef}
        render={
          <ToolbarButton aria-label={m.tickets_view_options_label()}>
            <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            <CollapsingLabel show={!compact}>
              {m.tickets_view_options_label()}
            </CollapsingLabel>
            <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
          </ToolbarButton>
        }
      />
      <PopoverContent
        aria-label={m.tickets_view_options_label()}
        anchor={anchor}
        align="end"
        side="bottom"
        collisionAvoidance={{
          side: "none",
          align: "shift",
          fallbackAxisSide: "none"
        }}
        className="flex max-h-[var(--available-height)] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0"
      >
        <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain p-3">
          {viewControls}
          {showSort && <Ordering />}
          {boardScope && (
            <>
              <BoardColumnsPicker scope={boardScope} />
              <ExpandSubTickets />
            </>
          )}
          <DisplayProperties />
        </div>
      </PopoverContent>
    </Popover>
  )
}

const PROPERTY_LABELS: Readonly<Record<DisplayProperty, () => string>> = {
  blockedBy: m.tickets_preview_blocked_by,
  blocking: m.tickets_preview_blocking,
  related: m.tickets_preview_related,
  duplicates: m.tickets_preview_duplicates,
  epic: m.tickets_type_epic,
  tags: m.tickets_view_options_property_tags,
  git: m.tickets_view_options_property_git,
  estimate: m.tickets_view_options_estimate,
  sprint: m.tickets_view_options_property_sprint,
  assignee: m.tickets_view_options_property_assignee
}

function DisplayProperties() {
  const { estimation } = useTicketToolbar()
  const { orgSlug, slug } = useProjectRoute()
  const membership = useAtomValue(
    sprintMembership(sprintListRequest(orgSlug, slug))
  )
  const hasSprints = Result.isSuccess(membership) && membership.value.size > 0
  const { shows, toggle, isDefault, reset } = useDisplayProperties()
  const offered = DISPLAY_PROPERTIES.filter(
    (property) =>
      (property !== "estimate" || estimation !== "off") &&
      (property !== "sprint" || hasSprints)
  )
  return (
    <section className="space-y-2 border-t border-border/60 pt-3">
      <div className="flex min-h-7 items-center justify-between gap-3">
        <h3 className="text-body text-muted-foreground">
          {m.tickets_view_options_display_properties()}
        </h3>
        {!isDefault && (
          <Button variant="ghost" size="sm" onClick={reset}>
            {m.tickets_view_options_reset()}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {offered.map((property) => (
          <Button
            key={property}
            type="button"
            variant="chip-toggle"
            size="sm"
            aria-pressed={shows(property)}
            onClick={() => toggle(property)}
          >
            {PROPERTY_LABELS[property]()}
          </Button>
        ))}
      </div>
    </section>
  )
}

function ExpandSubTickets() {
  const [expanded, setExpanded] = useSubTicketsExpanded()
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-body text-muted-foreground">
      {m.tickets_view_options_expand_sub_tickets()}
      <Switch checked={expanded} onCheckedChange={setExpanded} />
    </label>
  )
}

function Ordering() {
  const { query, onQueryChange, estimation } = useTicketToolbar()
  const ascending = query.sort.dir === "asc"
  const DirectionIcon = ascending ? ArrowUp : ArrowDown
  return (
    <OptionPicker
      label={m.tickets_view_options_ordering()}
      value={query.sort.key}
      onValueChange={(next) =>
        onQueryChange({
          ...query,
          sort: { ...query.sort, key: next }
        })
      }
      displayValue={SORT_FIELD_LABELS[query.sort.key]()}
      action={
        <Button
          variant="ghost"
          size="icon-sm"
          title={
            ascending
              ? m.tickets_view_options_ascending()
              : m.tickets_view_options_descending()
          }
          aria-label={
            ascending
              ? m.tickets_view_options_set_descending()
              : m.tickets_view_options_set_ascending()
          }
          onClick={() =>
            onQueryChange({
              ...query,
              sort: { ...query.sort, dir: ascending ? "desc" : "asc" }
            })
          }
        >
          <DirectionIcon />
        </Button>
      }
      items={sortKeysFor(estimation).map((key) => ({
        value: key,
        label: SORT_FIELD_LABELS[key]()
      }))}
    />
  )
}
