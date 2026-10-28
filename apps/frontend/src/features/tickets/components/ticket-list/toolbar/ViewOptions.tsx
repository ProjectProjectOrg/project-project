import { useAtomValue } from "@effect/atom-react"
import {
  sprintState,
  type AssigneeFilter,
  type EstimateFilterValue,
  type EstimationMode,
  TicketType,
  type TicketFilter,
  type Member
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"
import {
  ArrowUp,
  ArrowDown,
  ChevronDown,
  SlidersHorizontal,
  UserRound
} from "lucide-react"
import { useMemo, useRef, useState, type ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import { CollapsingLabel } from "@/components/ui/collapsing-label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { currentUserId } from "@/features/auth/atoms/auth"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SPRINT_STATE_META } from "@/features/sprints/components/SprintChip"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { TagChip } from "@/features/tags/components/TagChip"
import { useSubTicketsExpanded } from "@/features/tickets/hooks/useSubTicketsExpanded"
import {
  estimateFilterLabel,
  estimateFilterValues
} from "@/features/tickets/lib/estimateMeta"
import {
  filterableSprints,
  singleFilter,
  singleFilterValue,
  toggledTags
} from "@/features/tickets/lib/ticketFilters"
import { TYPE_LABELS, TYPE_META } from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { SORT_FIELD_LABELS, sortKeysFor } from "../sort"
import { useTicketToolbar } from "./context"
import {
  activeFilterCount as countActiveFilters,
  type SprintFilterValue
} from "./model"
import { Status } from "./parts"
import { ControlSlot, OptionPicker, ToolbarButton } from "./shared"
import { sortTagsByColor } from "./tagOrder"

export function ViewOptions({ showSort }: Readonly<{ showSort: boolean }>) {
  const {
    query,
    viewControls,
    patchFilter: onChange,
    filters,
    members,
    estimation,
    searchActive: compact
  } = useTicketToolbar()
  const value = query
  const activeFilterCount =
    countActiveFilters(value, filters) + (query.status?.length ? 1 : 0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] =
    useState<ComponentProps<typeof PopoverContent>["anchor"]>()
  const active = activeFilterCount > 0

  return (
    <ControlSlot>
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
              active={active}
              aria-label={
                compact && active
                  ? m.tickets_view_options_active_aria_label({
                      count: activeFilterCount
                    })
                  : m.tickets_view_options_label()
              }
            >
              <SlidersHorizontal className="size-4" strokeWidth={1.75} />
              <CollapsingLabel show={!compact}>
                {m.tickets_view_options_label()}
              </CollapsingLabel>
              {active && (
                <span className="rounded-full bg-foreground/10 px-1.5 font-mono text-[10px] text-foreground tabular-nums">
                  {activeFilterCount}
                </span>
              )}
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
          <div className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-3">
            {viewControls}
            {showSort && <Ordering />}
            <div className="space-y-2">
              <Status variant="panel" />
              {filters.map((dimension) => {
                switch (dimension) {
                  case "archived":
                    return null
                  case "type":
                    return (
                      <FilterType
                        key={dimension}
                        value={value?.type}
                        onChange={(type) => onChange({ type })}
                      />
                    )
                  case "assignee":
                    return (
                      <FilterAssignee
                        key={dimension}
                        value={value?.assignee}
                        onChange={(assignee) => onChange({ assignee })}
                        members={members}
                      />
                    )
                  case "sprint":
                    return (
                      <FilterSprint
                        key={dimension}
                        value={value?.groupId}
                        onChange={(groupId) => onChange({ groupId })}
                      />
                    )
                  case "estimate":
                    return (
                      <FilterEstimate
                        key={dimension}
                        value={value?.estimate}
                        onChange={(estimate) => onChange({ estimate })}
                        estimation={estimation}
                      />
                    )
                  case "tags":
                  case "subTicketExpansion":
                    return null
                }
                return null
              })}
              {filters.includes("archived") && (
                <FilterArchived
                  value={value?.archived}
                  onChange={(archived) => onChange({ archived })}
                />
              )}
              {filters.includes("tags") && (
                <FilterTags
                  value={value?.tags}
                  onChange={(tags) => onChange({ tags })}
                />
              )}
              {filters.includes("subTicketExpansion") && <ExpandSubTickets />}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </ControlSlot>
  )
}

function FilterArchived({
  value,
  onChange
}: Readonly<{
  value: TicketFilter["archived"]
  onChange: (value: TicketFilter["archived"]) => void
}>) {
  const archivedFilter = value === true
  const setArchivedFilter = (on: boolean) => onChange(on ? true : undefined)
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-[13px] text-muted-foreground">
      {m.tickets_filters_archived_show()}
      <Switch checked={archivedFilter} onCheckedChange={setArchivedFilter} />
    </label>
  )
}

function ExpandSubTickets() {
  const [expanded, setExpanded] = useSubTicketsExpanded()
  return (
    <label className="flex min-h-8 items-center justify-between gap-3 text-[13px] text-muted-foreground">
      {m.tickets_filters_expand_sub_tickets()}
      <Switch checked={expanded} onCheckedChange={setExpanded} />
    </label>
  )
}

function FilterType({
  value,
  onChange
}: Readonly<{
  value: TicketFilter["type"]
  onChange: (value: TicketFilter["type"]) => void
}>) {
  const typeFilter = singleFilterValue(value)
  const setTypeFilter = (type: TicketType | "all") =>
    onChange(singleFilter(type))
  return (
    <OptionPicker
      label={m.tickets_filters_section_type()}
      value={typeFilter}
      onValueChange={setTypeFilter}
      displayValue={
        typeFilter === "all"
          ? m.tickets_filters_all_types()
          : TYPE_LABELS[typeFilter]()
      }
      items={[
        { separated: true, value: "all", label: m.tickets_filters_all_types() },
        ...TicketType.literals.map((t) => {
          const TIcon = TYPE_META[t].icon
          return {
            value: t,
            label: (
              <>
                <TIcon className="size-4" strokeWidth={1.75} />
                {TYPE_LABELS[t]()}
              </>
            )
          }
        })
      ]}
    />
  )
}

function FilterAssignee({
  value,
  onChange,
  members
}: Readonly<{
  value: TicketFilter["assignee"]
  onChange: (value: TicketFilter["assignee"]) => void
  members: ReadonlyArray<Member>
}>) {
  const viewerId = useAtomValue(currentUserId)
  const assigneeFilter = singleFilterValue(value)
  const setAssigneeFilter = (assignee: AssigneeFilter | "all") =>
    onChange(singleFilter(assignee))
  return (
    <OptionPicker
      label={m.tickets_filters_section_assignee()}
      value={assigneeFilter}
      onValueChange={setAssigneeFilter}
      displayValue={Match.value(assigneeFilter).pipe(
        Match.when("all", () => m.tickets_filters_assignee_anyone()),
        Match.when("mine", () => m.tickets_filters_assignee_mine()),
        Match.when("unassigned", () => m.tickets_filters_assignee_unassigned()),
        Match.orElse(
          (id) => members.find((member) => member.id === id)?.name ?? id
        )
      )}
      items={[
        { value: "all", label: m.tickets_filters_assignee_anyone() },
        ...(viewerId
          ? [
              {
                value: "mine" as const,
                label: (
                  <>
                    <UserRound className="size-4" strokeWidth={1.75} />
                    {m.tickets_filters_assignee_mine()}
                  </>
                )
              }
            ]
          : []),
        {
          separated: members.length > 0,
          value: "unassigned",
          label: m.tickets_filters_assignee_unassigned()
        },
        ...members.map((member) => ({
          value: member.id,
          label: (
            <>
              <MemberAvatar member={member} size={20} />
              <span className="truncate">{member.name}</span>
            </>
          )
        }))
      ]}
    />
  )
}

function FilterEstimate({
  value,
  onChange,
  estimation
}: Readonly<{
  value: TicketFilter["estimate"]
  onChange: (value: TicketFilter["estimate"]) => void
  estimation: EstimationMode
}>) {
  const options = estimateFilterValues(estimation)
  if (options.length === 0) return null
  const selected = singleFilterValue(value)
  const select = (next: EstimateFilterValue | "all") =>
    onChange(singleFilter(next))
  return (
    <OptionPicker
      label={m.tickets_filters_section_estimate()}
      value={selected}
      onValueChange={select}
      displayValue={
        selected === "all"
          ? m.tickets_filters_estimate_all()
          : estimateFilterLabel(selected)
      }
      items={[
        {
          separated: true,
          value: "all",
          label: m.tickets_filters_estimate_all()
        },
        ...options.map((option) => ({
          value: option,
          label: estimateFilterLabel(option)
        }))
      ]}
    />
  )
}

function FilterSprint({
  value,
  onChange
}: Readonly<{
  value: TicketFilter["groupId"]
  onChange: (value: TicketFilter["groupId"]) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const sprintFilter = singleFilterValue(value)
  const setSprintFilter = (sprint: SprintFilterValue) =>
    onChange(singleFilter(sprint))
  const sprintReq = sprintListRequest(orgSlug, slug)
  const sprintsList = useAtomValue(sprintList(sprintReq))
  const allSprints = Result.isSuccess(sprintsList) ? sprintsList.value : []
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const sprintOptions = filterableSprints(allSprints, now)
  return (
    <OptionPicker
      label={m.tickets_filters_section_sprint()}
      value={sprintFilter}
      onValueChange={setSprintFilter}
      displayValue={Match.value(sprintFilter).pipe(
        Match.when("all", () => m.tickets_filters_sprint_any()),
        Match.when("ungrouped", () => m.tickets_filters_sprint_none()),
        Match.orElse(
          (id) => allSprints.find((sprint) => sprint.id === id)?.name ?? id
        )
      )}
      items={[
        { value: "all", label: m.tickets_filters_sprint_any() },
        {
          separated: sprintOptions.length > 0,
          value: "ungrouped",
          label: m.tickets_filters_sprint_none()
        },
        ...sprintOptions.map((s) => {
          const meta = SPRINT_STATE_META[sprintState(s, now)]
          const SIcon = meta.icon
          return {
            value: s.id,
            label: (
              <>
                <SIcon
                  className={cn("size-4", meta.className)}
                  strokeWidth={1.75}
                />
                <span className="truncate">{s.name}</span>
              </>
            )
          }
        })
      ]}
    />
  )
}

function FilterTags({
  value,
  onChange
}: Readonly<{
  value: TicketFilter["tags"]
  onChange: (value: TicketFilter["tags"]) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const selectedTags = value ?? []
  const req = tagsRequest(orgSlug, slug)
  const tags = useAtomValue(tagsFor(req))
  const tagList = useMemo(
    () => (Result.isSuccess(tags) ? sortTagsByColor(tags.value) : []),
    [tags]
  )
  if (tagList.length === 0) return null
  return (
    <div className="-mx-3 space-y-2 border-t border-border/60 px-3 pt-3">
      <div className="text-[13px] text-muted-foreground">
        {m.tickets_filters_section_tags()}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {tagList.map((tag) => {
          const selected = selectedTags.includes(tag.name)
          return (
            <button
              key={tag.name}
              type="button"
              onClick={(e) => {
                e.preventDefault()
                onChange(toggledTags(selectedTags, tag.name))
              }}
              aria-pressed={selected}
              className="rounded-md ring-offset-background transition-transform duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
            >
              <TagChip
                name={tag.name}
                color={tag.color ?? null}
                size="xs"
                intensity={selected ? "strong" : "soft"}
                className={cn(!selected && "opacity-60")}
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Ordering() {
  const { query, onQueryChange, estimation } = useTicketToolbar()
  const ascending = query.sort.dir === "asc"
  const DirectionIcon = ascending ? ArrowUp : ArrowDown
  return (
    <div className="-mx-3 space-y-2 border-b border-border/60 px-3 pb-3">
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
    </div>
  )
}
