import { Switch } from "@base-ui/react/switch"
import { useAtomValue } from "@effect/atom-react"
import {
  sprintState,
  SortKey,
  type AssigneeFilter,
  TicketType,
  type TicketFilter,
  type Member
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Match from "effect/Match"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import {
  ArrowUp,
  ArrowDown,
  Check,
  ChevronDown,
  SlidersHorizontal,
  UserRound
} from "lucide-react"
import { useMemo, useRef, useState, type ComponentProps } from "react"

import { MemberAvatar } from "@/components/MemberAvatar"
import { CollapsingLabel } from "@/components/SegmentedTabs"
import { SPRINT_STATE_META } from "@/components/sprints/SprintChip"
import { TagChip } from "@/components/TagChip"
import { Button } from "@/components/ui/button"
import { DropdownMenuItem } from "@/components/ui/dropdown-menu"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { me } from "@/features/auth/atoms/auth"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { TYPE_LABELS, TYPE_META } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { SORT_FIELD_LABELS } from "../sort"
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
    orgSlug,
    slug,
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
                        orgSlug={orgSlug}
                        slug={slug}
                      />
                    )
                  case "tags":
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
                  orgSlug={orgSlug}
                  slug={slug}
                />
              )}
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
      <Switch.Root
        checked={archivedFilter}
        onCheckedChange={setArchivedFilter}
        className="inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full bg-muted p-0.5 ring-1 ring-border transition-all duration-100 outline-none hover:ring-ring focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] data-[checked]:bg-foreground"
      >
        <Switch.Thumb className="size-4 rounded-full bg-background transition-transform duration-100 data-[checked]:translate-x-4" />
      </Switch.Root>
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
  const types = value
  const typeFilter = types?.length === 1 ? types[0] : "all"
  const setTypeFilter = (type: TicketType | "all") =>
    onChange(type === "all" ? undefined : [type])
  return (
    <OptionPicker
      label={m.tickets_filters_section_type()}
      value={
        typeFilter === "all"
          ? m.tickets_filters_all_types()
          : TYPE_LABELS[typeFilter]()
      }
    >
      <DropdownMenuItem
        onClick={() => setTypeFilter("all")}
        className="cursor-pointer"
      >
        {m.tickets_filters_all_types()}
        {typeFilter === "all" && (
          <Check className="ml-auto size-3.5 text-muted-foreground" />
        )}
      </DropdownMenuItem>
      {TicketType.literals.map((t) => {
        const TIcon = TYPE_META[t].icon
        return (
          <DropdownMenuItem
            key={t}

            onClick={() => setTypeFilter(t)}
            className="cursor-pointer"
          >
            <TIcon className="size-4" strokeWidth={1.75} />
            {TYPE_LABELS[t]()}
            {typeFilter === t && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )
      })}
    </OptionPicker>
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
  const viewer = useAtomValue(me())
  const viewerId = Result.isSuccess(viewer) ? viewer.value.id : null
  const assignees = value
  const assigneeFilter = assignees?.length === 1 ? assignees[0] : "all"
  const setAssigneeFilter = (assignee: AssigneeFilter | "all") =>
    onChange(assignee === "all" ? undefined : [assignee])
  return (
    <OptionPicker
      label={m.tickets_filters_section_assignee()}
      value={Match.value(assigneeFilter).pipe(
        Match.when("all", () => m.tickets_filters_assignee_anyone()),
        Match.when("mine", () => m.tickets_filters_assignee_mine()),
        Match.when("unassigned", () => m.tickets_filters_assignee_unassigned()),
        Match.orElse(
          (id) => members.find((member) => member.id === id)?.name ?? id
        )
      )}
    >
      <DropdownMenuItem
        onClick={() => setAssigneeFilter("all")}
        className="cursor-pointer"
      >
        {m.tickets_filters_assignee_anyone()}
        {assigneeFilter === "all" && (
          <Check className="ml-auto size-3.5 text-muted-foreground" />
        )}
      </DropdownMenuItem>
      {viewerId && (
        <DropdownMenuItem
          onClick={() => setAssigneeFilter("mine")}
          className="cursor-pointer"
        >
          <UserRound className="size-4" strokeWidth={1.75} />
          {m.tickets_filters_assignee_mine()}
          {assigneeFilter === "mine" && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        onClick={() => setAssigneeFilter("unassigned")}
        className="cursor-pointer"
      >
        {m.tickets_filters_assignee_unassigned()}
        {assigneeFilter === "unassigned" && (
          <Check className="ml-auto size-3.5 text-muted-foreground" />
        )}
      </DropdownMenuItem>
      {members.length > 0 && <div className="my-1 h-px bg-border" />}
      {members.map((member) => (
        <DropdownMenuItem
          key={member.id}

          onClick={() => setAssigneeFilter(member.id)}
          className="cursor-pointer"
        >
          <MemberAvatar member={member} size={20} />
          <span className="truncate">{member.name}</span>
          {assigneeFilter === member.id && (
            <Check className="ml-auto size-3.5 text-muted-foreground" />
          )}
        </DropdownMenuItem>
      ))}
    </OptionPicker>
  )
}

function FilterSprint({
  value,
  onChange,
  orgSlug,
  slug
}: Readonly<{
  value: TicketFilter["groupId"]
  onChange: (value: TicketFilter["groupId"]) => void
  orgSlug: string
  slug: string
}>) {
  const groups = value
  const sprintFilter = groups?.length === 1 ? groups[0] : "all"
  const setSprintFilter = (sprint: SprintFilterValue) =>
    onChange(sprint === "all" ? undefined : [sprint])
  const sprintReq = useMemo(
    () => sprintListRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const sprintsList = useAtomValue(sprintList(sprintReq))
  const allSprints = Result.isSuccess(sprintsList) ? sprintsList.value : []
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const sprintOptions = allSprints.filter((s) => {
    const st = sprintState(s, now)
    return st === "active" || st === "planned"
  })
  return (
    <OptionPicker
      label={m.tickets_filters_section_sprint()}
      value={Match.value(sprintFilter).pipe(
        Match.when("all", () => m.tickets_filters_sprint_any()),
        Match.when("ungrouped", () => m.tickets_filters_sprint_none()),
        Match.orElse(
          (id) => allSprints.find((sprint) => sprint.id === id)?.name ?? id
        )
      )}
    >
      <DropdownMenuItem
        onClick={() => setSprintFilter("all")}
        className="cursor-pointer"
      >
        {m.tickets_filters_sprint_any()}
        {sprintFilter === "all" && (
          <Check className="ml-auto size-3.5 text-muted-foreground" />
        )}
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => setSprintFilter("ungrouped")}
        className="cursor-pointer"
      >
        {m.tickets_filters_sprint_none()}
        {sprintFilter === "ungrouped" && (
          <Check className="ml-auto size-3.5 text-muted-foreground" />
        )}
      </DropdownMenuItem>
      {sprintOptions.length > 0 && <div className="my-1 h-px bg-border" />}
      {sprintOptions.map((s) => {
        const meta = SPRINT_STATE_META[sprintState(s, now)]
        const SIcon = meta.icon
        return (
          <DropdownMenuItem
            key={s.id}

            onClick={() => setSprintFilter(s.id)}
            className="cursor-pointer"
          >
            <SIcon
              className={cn("size-4", meta.className)}
              strokeWidth={1.75}
            />
            <span className="truncate">{s.name}</span>
            {sprintFilter === s.id && (
              <Check className="ml-auto size-3.5 text-muted-foreground" />
            )}
          </DropdownMenuItem>
        )
      })}
    </OptionPicker>
  )
}

function FilterTags({
  value,
  onChange,
  orgSlug,
  slug
}: Readonly<{
  value: TicketFilter["tags"]
  onChange: (value: TicketFilter["tags"]) => void
  orgSlug: string
  slug: string
}>) {
  const selectedTags = value ?? []
  const setSelectedTags = (tags: typeof selectedTags) =>
    onChange(tags.length ? tags : undefined)
  const req = useMemo(() => tagsRequest(orgSlug, slug), [orgSlug, slug])
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
                setSelectedTags(
                  selected
                    ? selectedTags.filter((t) => t !== tag.name)
                    : [...selectedTags, tag.name]
                )
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
  const { query, onQueryChange } = useTicketToolbar()
  const ascending = query.sort.dir === "asc"
  const DirectionIcon = ascending ? ArrowUp : ArrowDown
  return (
    <div className="-mx-3 space-y-2 border-b border-border/60 px-3 pb-3">
      <OptionPicker
        label={m.tickets_view_options_ordering()}
        value={SORT_FIELD_LABELS[query.sort.key]()}
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
      >
        {SortKey.literals.map((key) => (
          <DropdownMenuItem
            key={key}
            onClick={() =>
              onQueryChange({
                ...query,
                sort: { ...query.sort, key }
              })
            }
          >
            {SORT_FIELD_LABELS[key]()}
            {query.sort.key === key && <Check className="ml-auto size-3.5" />}
          </DropdownMenuItem>
        ))}
      </OptionPicker>
    </div>
  )
}
