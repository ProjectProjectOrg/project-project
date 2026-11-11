import { useAtomValue } from "@effect/atom-react"
import {
  sprintState,
  type AssigneeFilter,
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
  CircleDot,
  Gauge,
  ListFilter,
  OctagonMinus,
  Shapes,
  Tag,
  Timer,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react"
import {
  Fragment,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode
} from "react"

import { CheckboxMenuItem } from "@/components/ui/checkbox-menu-item"
import { CollapsingLabel } from "@/components/ui/collapsing-label"
import { CountPill } from "@/components/ui/count-pill"
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
} from "@/components/ui/dropdown-menu"
import { menuItemMetaClass } from "@/components/ui/menu-styles"
import { currentUserId } from "@/features/auth/atoms/auth"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SPRINT_STATE_META } from "@/features/sprints/components/SprintChip"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { TagMenuItem } from "@/features/tags/components/TagMenuItem"
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
  statusMetaFor,
  TYPE_LABELS,
  TYPE_META
} from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useTicketToolbar } from "./context"
import {
  activeFilterCount as countActiveFilters,
  clearedFilters,
  type FilterDimension
} from "./model"
import { ToolbarButton } from "./shared"
import { sortTagsByColor } from "./tagOrder"

const TOGGLES: ReadonlySet<FilterDimension> = new Set(["archived", "blocked"])

export function Filters() {
  const {
    query,
    patchFilter: onChange,
    filters,
    members,
    estimation,
    counts,
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
  const hasToggles = filters.some((dimension) => TOGGLES.has(dimension))
  const hasSubmenus =
    showStatus || filters.some((dimension) => !TOGGLES.has(dimension))

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
            <ListFilter className="size-4" strokeWidth={1.75} />
            <CollapsingLabel show={!compact}>
              {m.tickets_filters_label()}
            </CollapsingLabel>
            <CollapsingLabel show={active} contentKey={shownCount}>
              <CountPill active>{shownCount}</CountPill>
            </CollapsingLabel>
            <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
          </ToolbarButton>
        }
      />
      <DropdownMenuContent
        anchor={anchor}
        align="start"
        sideOffset={6}
        className="w-52"
        finalFocus={false}
      >
        {showStatus && (
          <FilterStatus
            value={value.status}
            onChange={(status) => onChange({ status })}
            counts={counts}
          />
        )}
        {filters.includes("type") && (
          <FilterType
            value={value?.type}
            onChange={(type) => onChange({ type })}
          />
        )}
        {filters.includes("assignee") && (
          <FilterAssignee
            value={value?.assignee}
            onChange={(assignee) => onChange({ assignee })}
            members={members}
          />
        )}
        {filters.includes("sprint") && (
          <FilterSprint
            value={value?.groupId}
            onChange={(groupId) => onChange({ groupId })}
          />
        )}
        {filters.includes("estimate") && (
          <FilterEstimate
            value={value?.estimate}
            onChange={(estimate) => onChange({ estimate })}
            estimation={estimation}
          />
        )}
        {filters.includes("tags") && (
          <FilterTags
            value={value?.tags}
            onChange={(tags) => onChange({ tags })}
          />
        )}
        {hasSubmenus && hasToggles && <DropdownMenuSeparator />}
        {filters.includes("blocked") && (
          <DropdownMenuCheckboxItem
            checked={value?.blocked === true}
            onCheckedChange={(on) =>
              onChange({ blocked: on ? true : undefined })
            }
          >
            <OctagonMinus className="size-4" strokeWidth={1.75} />
            {m.tickets_filters_blocked_only()}
          </DropdownMenuCheckboxItem>
        )}
        {filters.includes("archived") && (
          <DropdownMenuCheckboxItem
            checked={value?.archived === true}
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
            <DropdownMenuItem
              onClick={() =>
                onChange({
                  ...clearedFilters(filters),
                  status: showStatus ? undefined : value.status
                })
              }
              className="cursor-pointer"
            >
              <X className="size-4" strokeWidth={1.75} />
              {m.tickets_filters_clear_all()}
            </DropdownMenuItem>
          </>
        )}
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
  icon: LucideIcon
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
  return (
    <>
      {options.map((option) => (
        <Fragment key={option.value}>
          <CheckboxMenuItem
            label={option.label}
            checked={selected?.includes(option.value) === true}
            onToggle={() => onChange(toggled(selected, option.value))}
          >
            {option.content}
          </CheckboxMenuItem>
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
  return (
    <FilterSubmenu icon={Shapes} label={m.tickets_filters_section_type()}>
      <CheckboxOptions
        selected={value}
        onChange={onChange}
        options={TicketType.literals.map((type) => {
          const TIcon = TYPE_META[type].icon
          const label = TYPE_LABELS[type]()
          return {
            value: type,
            label,
            content: (
              <>
                <TIcon className="size-4" strokeWidth={1.75} />
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
            checked={value?.includes(tag.name) === true}
            onToggle={() => onChange(toggled(value, tag.name))}
          />
        ))}
      </DropdownMenuList>
      <DropdownMenuEmpty>{m.tickets_command_tags_empty()}</DropdownMenuEmpty>
    </FilterSubmenu>
  )
}
