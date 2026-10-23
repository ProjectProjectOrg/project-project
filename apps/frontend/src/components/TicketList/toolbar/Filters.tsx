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
import * as Result from "effect/reactivity/AsyncResult"
import {
  Archive,
  ChevronDown,
  SlidersHorizontal,
  UserRound
} from "lucide-react"
import { useMemo, useRef, useState, type ComponentProps } from "react"

import { MemberAvatar } from "@/components/MemberAvatar"
import { CollapsingLabel } from "@/components/SegmentedTabs"
import { SPRINT_STATE_META } from "@/components/sprints/SprintChip"
import { TagChip } from "@/components/TagChip"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { me } from "@/features/auth/atoms/auth"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { estimateFilterLabel, estimateFilterValues } from "@/lib/estimate-meta"
import { TYPE_LABELS, TYPE_META } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useTicketToolbar } from "./context"
import {
  activeFilterCount as countActiveFilters,
  type SprintFilterValue
} from "./model"
import {
  ControlSlot,
  FilterSection,
  SectionLabel,
  ToolbarButton
} from "./shared"

export function Filters() {
  const {
    query,
    patchFilter: onChange,
    filters,
    members,
    orgSlug,
    slug,
    estimation,
    searchActive: compact
  } = useTicketToolbar()
  const value = query
  const activeFilterCount = countActiveFilters(value, filters)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] =
    useState<ComponentProps<typeof DropdownMenuContent>["anchor"]>()
  const active = activeFilterCount > 0

  return (
    <ControlSlot>
      <DropdownMenu
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
        <DropdownMenuTrigger
          ref={triggerRef}
          render={
            <ToolbarButton
              active={active}
              aria-label={
                compact && active
                  ? m.tickets_filters_active_aria_label({
                      count: activeFilterCount
                    })
                  : m.tickets_filters_aria_label()
              }
            >
              <SlidersHorizontal className="size-4" strokeWidth={1.75} />
              <CollapsingLabel show={!compact}>
                {m.tickets_filters_label()}
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
        <DropdownMenuContent
          anchor={anchor}
          align="end"
          sideOffset={6}
          className="w-56"
          finalFocus={false}
        >
          {filters.map((dimension) => {
            switch (dimension) {
              case "archived":
                return (
                  <FilterArchived
                    key={dimension}
                    value={value?.archived}
                    onChange={(archived) => onChange({ archived })}
                  />
                )
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
                return (
                  <FilterTags
                    key={dimension}
                    value={value?.tags}
                    onChange={(tags) => onChange({ tags })}
                    orgSlug={orgSlug}
                    slug={slug}
                  />
                )
            }
            return null
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </ControlSlot>
  )
}

function FilterArchived({
  value,
  onChange
}: {
  value: TicketFilter["archived"]
  onChange: (value: TicketFilter["archived"]) => void
}) {
  const archivedFilter = value === true
  const setArchivedFilter = (on: boolean) => onChange(on ? true : undefined)
  return (
    <FilterSection>
      <SectionLabel>{m.tickets_filters_section_archived()}</SectionLabel>
      <DropdownMenuCheckboxItem
        checked={archivedFilter}
        onCheckedChange={setArchivedFilter}
      >
        <Archive className="size-4" strokeWidth={1.75} />
        {m.tickets_filters_archived_show()}
      </DropdownMenuCheckboxItem>
    </FilterSection>
  )
}

function FilterType({
  value,
  onChange
}: {
  value: TicketFilter["type"]
  onChange: (value: TicketFilter["type"]) => void
}) {
  const types = value
  const typeFilter = types?.length === 1 ? types[0] : "all"
  const setTypeFilter = (type: TicketType | "all") =>
    onChange(type === "all" ? undefined : [type])
  return (
    <FilterSection>
      <SectionLabel>{m.tickets_filters_section_type()}</SectionLabel>
      <DropdownMenuRadioGroup
        value={typeFilter}
        onValueChange={setTypeFilter}
        items={[
          {
            separated: true,
            value: "all",
            label: m.tickets_filters_all_types()
          },
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
    </FilterSection>
  )
}

function FilterAssignee({
  value,
  onChange,
  members
}: {
  value: TicketFilter["assignee"]
  onChange: (value: TicketFilter["assignee"]) => void
  members: ReadonlyArray<Member>
}) {
  const viewer = useAtomValue(me())
  const viewerId = Result.isSuccess(viewer) ? viewer.value.id : null
  const assignees = value
  const assigneeFilter = assignees?.length === 1 ? assignees[0] : "all"
  const setAssigneeFilter = (assignee: AssigneeFilter | "all") =>
    onChange(assignee === "all" ? undefined : [assignee])
  return (
    <FilterSection>
      <SectionLabel>{m.tickets_filters_section_assignee()}</SectionLabel>
      <DropdownMenuRadioGroup
        value={assigneeFilter}
        onValueChange={setAssigneeFilter}
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
    </FilterSection>
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
  const selected = value?.length === 1 ? value[0] : "all"
  const select = (next: EstimateFilterValue | "all") =>
    onChange(next === "all" ? undefined : [next])
  return (
    <FilterSection>
      <SectionLabel>{m.tickets_filters_section_estimate()}</SectionLabel>
      <DropdownMenuRadioGroup
        value={selected}
        onValueChange={select}
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
    </FilterSection>
  )
}

function FilterSprint({
  value,
  onChange,
  orgSlug,
  slug
}: {
  value: TicketFilter["groupId"]
  onChange: (value: TicketFilter["groupId"]) => void
  orgSlug: string
  slug: string
}) {
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
    <FilterSection>
      <SectionLabel>{m.tickets_filters_section_sprint()}</SectionLabel>
      <DropdownMenuRadioGroup
        value={sprintFilter}
        onValueChange={setSprintFilter}
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
    </FilterSection>
  )
}

function FilterTags({
  value,
  onChange,
  orgSlug,
  slug
}: {
  value: TicketFilter["tags"]
  onChange: (value: TicketFilter["tags"]) => void
  orgSlug: string
  slug: string
}) {
  const selectedTags = value ?? []
  const setSelectedTags = (tags: typeof selectedTags) =>
    onChange(tags.length ? tags : undefined)
  const req = useMemo(() => tagsRequest(orgSlug, slug), [orgSlug, slug])
  const tags = useAtomValue(tagsFor(req))
  const tagList = Result.isSuccess(tags) ? tags.value : []
  if (tagList.length === 0) return null
  return (
    <FilterSection>
      <SectionLabel>{m.tickets_filters_section_tags()}</SectionLabel>
      <div className="flex flex-wrap gap-1 px-2 pt-0.5 pb-1.5">
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
    </FilterSection>
  )
}
