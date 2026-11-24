import { useAtomValue } from "@effect/atom-react"
import {
  sprintState,
  type AssigneeFilter,
  type EstimationMode,
  type TicketFilter,
  type Member
} from "@pp/shared"
import { Badge } from "@pp/ui/badge"
import { CollapsingLabel } from "@pp/ui/collapsing-label"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuItem,
  DropdownMenuList,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import {
  Archive,
  CircleDot,
  Flag,
  Gauge,
  Layers,
  ListFilter,
  OctagonMinus,
  Shapes,
  Tag,
  Timer,
  UserRound,
  X,
  type IconType
} from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import { menuItemMetaClass } from "@pp/ui/menu-styles"
import { TextSwap } from "@pp/ui/text-swap"
import { ToolbarButton, ToolbarClearButton } from "@pp/ui/toolbar-button"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"
import {
  Fragment,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode
} from "react"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import { SPRINT_STATE_META } from "@/features/sprints/lib/sprintPresentation"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { TagMenuItem } from "@/features/tags/components/TagMenuItem"
import { epicsRequest, projectEpics } from "@/features/tickets/atoms/epics"
import { TypeGlyph } from "@/features/tickets/components/TypeGlyph"
import { useTicketTypes } from "@/features/tickets/hooks/useTicketTypes"
import {
  estimateFilterLabel,
  estimateFilterValues
} from "@/features/tickets/lib/estimateMeta"
import {
  filterableSprints,
  toggled
} from "@/features/tickets/lib/ticketFilters"
import {
  statusLabelFor,
  statusMetaFor
} from "@/features/tickets/lib/ticketMeta"
import { typeName, typeOptions } from "@/features/tickets/lib/ticketTypes"
import { m } from "@/paraglide/messages"

import { useTicketToolbar } from "./context"
import {
  activeFilterCount as countActiveFilters,
  clearedFilters,
  type FilterDimension
} from "./model"
import { ToolbarChevron } from "./shared"
import { sortTagsByColor } from "./tagOrder"

const TOGGLES: ReadonlySet<FilterDimension> = new Set([
  "archived",
  "blocked",
  "flagged"
])

export function Filters() {
  const {
    query,
    patchFilter: onChange,
    filters,
    boardScope,
    searchActive: compact
  } = useTicketToolbar()
  const value = query
  const showStatus = !boardScope
  const activeFilterCount =
    countActiveFilters(value, filters) +
    (showStatus && value.status?.length ? 1 : 0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] =
    useState<ComponentProps<typeof DropdownMenuContent>["anchor"]>()
  const active = activeFilterCount > 0
  const [shownCount, setShownCount] = useState(activeFilterCount)
  if (active && activeFilterCount !== shownCount) {
    setShownCount(activeFilterCount)
  }
  const clearFilters = () =>
    onChange({
      ...clearedFilters(filters),
      status: showStatus ? undefined : value.status
    })
  return (
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
      <div className="group/toolbar relative flex">
        <DropdownMenuTrigger
          ref={triggerRef}
          render={
            <ToolbarButton
              active={active}
              aria-label={
                active
                  ? m.tickets_filters_active_aria_label({
                      count: activeFilterCount
                    })
                  : m.tickets_filters_aria_label()
              }
            >
              <ListFilter className="size-4" strokeWidth={1.75} />
              <CollapsingLabel show={!compact}>
                {m.tickets_filters_label()}
              </CollapsingLabel>{" "}
              <CollapsingLabel show={active}>
                <Badge variant="count" active>
                  <TextSwap speed="fast">{String(shownCount)}</TextSwap>
                </Badge>
              </CollapsingLabel>
              <CollapsingLabel show={!active}>
                <ToolbarChevron />
              </CollapsingLabel>
              <CollapsingLabel show={active}>
                <span aria-hidden className="block size-5" />
              </CollapsingLabel>
            </ToolbarButton>
          }
        />
        {active && (
          <ToolbarClearButton
            label={m.tickets_filters_clear_all()}
            onClick={clearFilters}
          />
        )}
      </div>
      <DropdownMenuContent
        anchor={anchor}
        align="start"
        sideOffset={6}
        className="w-52"
        finalFocus={false}
      >
        <FilterChoices active={active} clearFilters={clearFilters} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FilterSubmenu({
  icon: Icon,
  label,
  filterable = false,
  className = "w-48",
  children
}: Readonly<{
  icon: IconType
  label: string
  filterable?: boolean
  className?: string
  children: ReactNode
}>) {
  return (
    <DropdownMenuSub filterable={filterable}>
      <DropdownMenuSubTrigger>
        <Icon className="size-4" strokeWidth={1.75} />
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={className}>
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

type CheckOption<A extends string> = Readonly<{
  value: A
  label: string
  content: ReactNode
  separated?: boolean
}>

function CheckboxOptions<A extends string>({
  options,
  selected,
  onChange
}: Readonly<{
  options: ReadonlyArray<CheckOption<A>>
  selected: ReadonlyArray<A> | undefined
  onChange: (next: ReadonlyArray<A> | undefined) => void
}>) {
  const checked = new Set(selected)
  return (
    <>
      {options.map((option) => (
        <Fragment key={option.value}>
          <DropdownMenuCheckboxItem
            label={option.label}
            checked={checked.has(option.value)}
            closeOnClick={false}
            onCheckedChange={() => onChange(toggled(selected, option.value))}
          >
            {option.content}
          </DropdownMenuCheckboxItem>
          {option.separated && <DropdownMenuSeparator />}
        </Fragment>
      ))}
    </>
  )
}

const text = (label: string) => (
  <span className="min-w-0 truncate">{label}</span>
)

function FilterStatus({
  value,
  onChange,
  counts
}: Readonly<{
  value: TicketFilter["status"]
  onChange: (value: TicketFilter["status"]) => void
  counts: Record<string, number> | null
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const statuses = Result.isSuccess(result) ? result.value : []
  return (
    <FilterSubmenu
      icon={CircleDot}
      label={m.tickets_filters_section_status()}
      className="w-52"
    >
      <CheckboxOptions
        selected={value}
        onChange={onChange}
        options={boardStatusesFor(statuses).map((status) => {
          const meta = statusMetaFor(status, statuses)
          const SIcon = meta.icon
          const label = statusLabelFor(status, statuses)
          return {
            value: status,
            label,
            content: (
              <>
                <SIcon
                  className={cn("size-4", meta.className)}
                  style={meta.color ? { color: meta.color } : undefined}
                  strokeWidth={1.75}
                />
                {text(label)}
                {counts && (
                  <span data-menu-meta className={menuItemMetaClass}>
                    {counts[status] ?? 0}
                  </span>
                )}
              </>
            )
          }
        })}
      />
    </FilterSubmenu>
  )
}

function FilterType({
  value,
  onChange
}: Readonly<{
  value: TicketFilter["type"]
  onChange: (value: TicketFilter["type"]) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const types = useTicketTypes(orgSlug, slug)
  return (
    <FilterSubmenu icon={Shapes} label={m.tickets_filters_section_type()}>
      <CheckboxOptions
        selected={value}
        onChange={onChange}
        options={typeOptions(types).map((option) => {
          const label = typeName(option.type)
          return {
            value: option.value,
            label,
            content: (
              <>
                <TypeGlyph type={option.type} />
                {text(label)}
              </>
            )
          }
        })}
      />
    </FilterSubmenu>
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
  const options: ReadonlyArray<CheckOption<AssigneeFilter>> = [
    ...(viewerId
      ? [
          {
            value: "mine" as const,
            label: m.tickets_filters_assignee_mine(),
            content: (
              <>
                <UserRound className="size-4" strokeWidth={1.75} />
                {text(m.tickets_filters_assignee_mine())}
              </>
            )
          }
        ]
      : []),
    {
      value: "unassigned",
      label: m.tickets_filters_assignee_unassigned(),
      content: text(m.tickets_filters_assignee_unassigned()),
      separated: members.length > 0
    },
    ...members.map((member) => ({
      value: member.id,
      label: member.username
        ? `${member.name} ${member.username}`
        : member.name,
      content: (
        <>
          <MemberAvatar member={member} size={20} />
          {text(member.name)}
        </>
      )
    }))
  ]
  return (
    <FilterSubmenu
      icon={UserRound}
      label={m.tickets_filters_section_assignee()}
      filterable
      className="w-56"
    >
      <DropdownMenuInput
        placeholder={m.tickets_assignee_search_placeholder()}
        aria-label={m.tickets_assignee_search_placeholder()}
      />
      <DropdownMenuList className="max-h-72 overflow-y-auto">
        <CheckboxOptions
          selected={value}
          onChange={onChange}
          options={options}
        />
      </DropdownMenuList>
      <DropdownMenuEmpty>{m.tickets_assignee_search_empty()}</DropdownMenuEmpty>
    </FilterSubmenu>
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
  return (
    <FilterSubmenu icon={Gauge} label={m.tickets_filters_section_estimate()}>
      <CheckboxOptions
        selected={value}
        onChange={onChange}
        options={options.map((option) => ({
          value: option,
          label: estimateFilterLabel(option),
          content: text(estimateFilterLabel(option))
        }))}
      />
    </FilterSubmenu>
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
  const sprintsList = useAtomValue(sprintList(sprintListRequest(orgSlug, slug)))
  const allSprints = Result.isSuccess(sprintsList) ? sprintsList.value : []
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const sprintOptions = filterableSprints(allSprints, now)
  return (
    <FilterSubmenu
      icon={Timer}
      label={m.tickets_filters_section_sprint()}
      className="w-56"
    >
      <CheckboxOptions
        selected={value}
        onChange={onChange}
        options={[
          {
            value: "ungrouped",
            label: m.tickets_filters_sprint_none(),
            content: text(m.tickets_filters_sprint_none()),
            separated: sprintOptions.length > 0
          },
          ...sprintOptions.map((sprint) => {
            const meta = SPRINT_STATE_META[sprintState(sprint, now)]
            const SIcon = meta.icon
            return {
              value: sprint.id,
              label: sprint.name,
              content: (
                <>
                  <SIcon
                    className={cn("size-4", meta.className)}
                    strokeWidth={1.75}
                  />
                  {text(sprint.name)}
                </>
              )
            }
          })
        ]}
      />
    </FilterSubmenu>
  )
}

function FilterEpic({
  value,
  onChange
}: Readonly<{
  value: TicketFilter["parent"]
  onChange: (value: TicketFilter["parent"]) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(projectEpics(epicsRequest(orgSlug, slug)))
  const epics = Result.isSuccess(result) ? result.value : []
  return (
    <FilterSubmenu
      icon={Layers}
      label={m.tickets_filters_section_epic()}
      filterable
      className="w-64"
    >
      <DropdownMenuInput
        placeholder={m.tickets_filters_epic_search_placeholder()}
        aria-label={m.tickets_filters_epic_search_placeholder()}
      />
      <DropdownMenuList className="max-h-72 overflow-y-auto">
        <CheckboxOptions
          selected={value}
          onChange={onChange}
          options={[
            {
              value: "none",
              label: m.tickets_filters_epic_none(),
              content: text(m.tickets_filters_epic_none()),
              separated: epics.length > 0
            },
            ...epics.map((epic) => ({
              value: epic.id,
              label: `${epic.id} ${epic.title}`,
              content: text(epic.title)
            }))
          ]}
        />
      </DropdownMenuList>
      <DropdownMenuEmpty>
        {m.tickets_filters_epic_search_empty()}
      </DropdownMenuEmpty>
    </FilterSubmenu>
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
  const tags = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  const tagList = useMemo(
    () => (Result.isSuccess(tags) ? sortTagsByColor(tags.value) : []),
    [tags]
  )
  if (tagList.length === 0) return null
  const selected = new Set(value)
  return (
    <FilterSubmenu
      icon={Tag}
      label={m.tickets_filters_section_tags()}
      filterable
      className="w-56"
    >
      <DropdownMenuInput
        placeholder={m.tickets_filters_tags_search_placeholder()}
        aria-label={m.tickets_filters_tags_search_placeholder()}
      />
      <DropdownMenuList className="max-h-72 overflow-y-auto">
        {tagList.map((tag) => (
          <TagMenuItem
            key={tag.name}
            tag={tag}
            checked={selected.has(tag.name)}
            onToggle={() => onChange(toggled(value, tag.name))}
          />
        ))}
      </DropdownMenuList>
      <DropdownMenuEmpty>{m.tickets_command_tags_empty()}</DropdownMenuEmpty>
    </FilterSubmenu>
  )
}

function FilterChoices({
  active,
  clearFilters
}: Readonly<{ active: boolean; clearFilters: () => void }>) {
  const {
    query: value,
    patchFilter: onChange,
    filters,
    counts,
    members,
    estimation,
    boardScope
  } = useTicketToolbar()
  const showStatus = !boardScope
  const hasToggles = filters.some((dimension) => TOGGLES.has(dimension))
  const hasSubmenus =
    showStatus || filters.some((dimension) => !TOGGLES.has(dimension))

  return (
    <>
      {showStatus && (
        <FilterStatus
          value={value.status}
          onChange={(status) => onChange({ status })}
          counts={counts}
        />
      )}
      {filters.includes("type") && (
        <FilterType
          value={value.type}
          onChange={(type) => onChange({ type })}
        />
      )}
      {filters.includes("assignee") && (
        <FilterAssignee
          value={value.assignee}
          onChange={(assignee) => onChange({ assignee })}
          members={members}
        />
      )}
      {filters.includes("sprint") && (
        <FilterSprint
          value={value.groupId}
          onChange={(groupId) => onChange({ groupId })}
        />
      )}
      {filters.includes("epic") && (
        <FilterEpic
          value={value.parent}
          onChange={(parent) => onChange({ parent })}
        />
      )}
      {filters.includes("estimate") && (
        <FilterEstimate
          value={value.estimate}
          onChange={(estimate) => onChange({ estimate })}
          estimation={estimation}
        />
      )}
      {filters.includes("tags") && (
        <FilterTags
          value={value.tags}
          onChange={(tags) => onChange({ tags })}
        />
      )}
      {hasSubmenus && hasToggles && <DropdownMenuSeparator />}
      {filters.includes("blocked") && (
        <DropdownMenuCheckboxItem
          checked={value.blocked === true}
          onCheckedChange={(on) => onChange({ blocked: on ? true : undefined })}
        >
          <OctagonMinus className="size-4" strokeWidth={1.75} />
          {m.tickets_filters_blocked_only()}
        </DropdownMenuCheckboxItem>
      )}
      {filters.includes("flagged") && (
        <DropdownMenuCheckboxItem
          checked={value.flagged === true}
          onCheckedChange={(on) => onChange({ flagged: on ? true : undefined })}
        >
          <Flag className="size-4" strokeWidth={1.75} />
          {m.tickets_filters_flagged_only()}
        </DropdownMenuCheckboxItem>
      )}
      {filters.includes("archived") && (
        <DropdownMenuCheckboxItem
          checked={value.archived === true}
          onCheckedChange={(on) =>
            onChange({ archived: on ? true : undefined })
          }
        >
          <Archive className="size-4" strokeWidth={1.75} />
          {m.tickets_filters_archived_show()}
        </DropdownMenuCheckboxItem>
      )}
      {active && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={clearFilters} className="cursor-pointer">
            <X className="size-4" strokeWidth={1.75} />
            {m.tickets_filters_clear_all()}
          </DropdownMenuItem>
        </>
      )}
    </>
  )
}
