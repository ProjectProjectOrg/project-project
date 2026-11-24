import { useAtomValue } from "@effect/atom-react"
import { DEFAULT_TICKET_SORT, NATURAL_SORT_DIR } from "@pp/shared"
import { Badge } from "@pp/ui/badge"
import { Button } from "@pp/ui/button"
import { CollapsingLabel } from "@pp/ui/collapsing-label"
import { ArrowUp, ArrowDown, SlidersHorizontal } from "@pp/ui/icons"
import {
  Popover,
  PopoverContent,
  PopoverFooter,
  PopoverTrigger
} from "@pp/ui/popover"
import { Switch } from "@pp/ui/switch"
import { TextSwap } from "@pp/ui/text-swap"
import { ToolbarButton } from "@pp/ui/toolbar-button"
import * as Result from "effect/reactivity/AsyncResult"
import { useRef, useState, type ComponentProps } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import { useBoardColumns } from "@/features/sprints/hooks/useBoardColumns"
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
import { OptionPicker, ToolbarChevron } from "./shared"

export function ViewOptions({ showSort }: Readonly<{ showSort: boolean }>) {
  const { viewControls, boardScope, searchActive: compact } = useTicketToolbar()
  const { changedCount, reset } = useViewDefaults(showSort)
  const changed = changedCount > 0
  const [shownCount, setShownCount] = useState(changedCount)
  if (changed && changedCount !== shownCount) {
    setShownCount(changedCount)
  }
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
          <ToolbarButton
            active={changed}
            aria-label={
              changed
                ? m.tickets_view_options_changed_aria_label({
                    count: changedCount
                  })
                : m.tickets_view_options_label()
            }
          >
            <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            <CollapsingLabel show={!compact}>
              {m.tickets_view_options_label()}
            </CollapsingLabel>{" "}
            <CollapsingLabel show={changed}>
              <Badge variant="count" active>
                <TextSwap speed="fast">{String(shownCount)}</TextSwap>
              </Badge>
            </CollapsingLabel>
            <ToolbarChevron />
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
        <div className="min-h-0 space-y-2 overflow-y-auto overscroll-none p-3">
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
        <PopoverFooter show={changed}>
          <Button variant="ghost" size="sm" onClick={reset}>
            {m.tickets_view_options_reset()}
          </Button>
        </PopoverFooter>
      </PopoverContent>
    </Popover>
  )
}

function useViewDefaults(showSort: boolean) {
  const { query, onQueryChange, boardScope, onResetViewControls } =
    useTicketToolbar()
  const columns = useBoardColumns(boardScope ?? "backlog")
  const [subTicketsExpanded, setSubTicketsExpanded] = useSubTicketsExpanded()
  const properties = useDisplayProperties()
  const sortChanged =
    showSort &&
    (query.sort.key !== DEFAULT_TICKET_SORT.key ||
      query.sort.dir !== DEFAULT_TICKET_SORT.dir)
  const columnsChanged =
    boardScope !== undefined &&
    columns.hidden.length + columns.collapsed.length > 0
  const subTicketsChanged = boardScope !== undefined && !subTicketsExpanded
  return {
    changedCount: [
      onResetViewControls !== undefined,
      sortChanged,
      columnsChanged,
      subTicketsChanged,
      !properties.isDefault
    ].filter(Boolean).length,
    reset: () => {
      onResetViewControls?.()
      if (sortChanged) onQueryChange({ ...query, sort: DEFAULT_TICKET_SORT })
      if (columnsChanged) columns.reset()
      if (subTicketsChanged) setSubTicketsExpanded(true)
      properties.reset()
    }
  }
}

const PROPERTY_LABELS: Readonly<Record<DisplayProperty, () => string>> = {
  blockedBy: m.tickets_preview_blocked_by,
  blocking: m.tickets_preview_blocking,
  related: m.tickets_preview_related,
  duplicates: m.tickets_preview_duplicates,
  epic: m.tickets_view_options_property_epic,
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
  const { shows, toggle } = useDisplayProperties()
  const offered = DISPLAY_PROPERTIES.filter(
    (property) =>
      (property !== "estimate" || estimation !== "off") &&
      (property !== "sprint" || hasSprints)
  )
  return (
    <section className="space-y-2 border-t border-border/60 pt-3">
      <h3 className="flex min-h-7 items-center text-body text-muted-foreground">
        {m.tickets_view_options_display_properties()}
      </h3>
      <div className="flex flex-wrap gap-1.5">
        {offered.map((property) => (
          <Button
            key={property}
            type="button"
            variant="ghost"
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
          sort: {
            key: next,
            dir:
              next === "manual" || query.sort.key === "manual"
                ? NATURAL_SORT_DIR[next]
                : query.sort.dir
          }
        })
      }
      displayValue={SORT_FIELD_LABELS[query.sort.key]()}
      action={
        query.sort.key !== "manual" && (
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
        )
      }
      items={sortKeysFor(estimation).map((key) => ({
        value: key,
        label: SORT_FIELD_LABELS[key]()
      }))}
    />
  )
}
