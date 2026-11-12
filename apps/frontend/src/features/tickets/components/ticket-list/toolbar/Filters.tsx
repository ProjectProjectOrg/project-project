import { useAtomValue } from "@effect/atom-react"
import {
  sprintState,
  type AssigneeFilter,
  type EstimationMode,
  TicketType,
  type TicketFilter,
  TicketFilterRule,
  type TicketFacetCounts,
  ticketRule,
  withTicketRule,
  withoutTicketRule,
  type Member
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
import * as Schema from "effect/Schema"
import { CircleDot, ListFilter, Plus, UserRound } from "lucide-react"
import {
  Fragment,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement
} from "react"

import { CheckboxMenuItem } from "@/components/ui/checkbox-menu-item"
import { CollapsingLabel } from "@/components/ui/collapsing-label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuEmpty,
  DropdownMenuInput,
  DropdownMenuList,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent
} from "@/components/ui/dropdown-menu"
import { menuItemMetaClass } from "@/components/ui/menu-styles"
import { currentUserId } from "@/features/auth/atoms/auth"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SPRINT_STATE_META } from "@/features/sprints/components/SprintChip"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import { tagsFor, tagsRequest } from "@/features/tags/atoms/tags"
import { TagMenuItem } from "@/features/tags/components/TagMenuItem"
import {
  facetsRequest,
  ticketFacets
} from "@/features/tickets/atoms/ticketFacets"
import { FILTER_DIMENSION_META } from "@/features/tickets/hooks/useFilterOptions"
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
import type { FilterDimension } from "./model"
import { ToolbarButton } from "./shared"
import { sortTagsByColor } from "./tagOrder"

const decodeFilterRule = Schema.decodeUnknownOption(TicketFilterRule)

type Counts = Readonly<Record<string, number>> | null

const noFacets = Atom.make(Result.initial<TicketFacetCounts>())

function useDimensionCounts(
  dimension: PickerDimension,
  query: TicketFilter,
  statusCounts: Counts
): Counts {
  const { orgSlug, slug } = useProjectRoute()
  const field =
    dimension === "status" ||
    dimension === "blocked" ||
    dimension === "archived"
      ? null
      : dimension
  const result = useAtomValue(
    field === null
      ? noFacets
      : ticketFacets(facetsRequest(orgSlug, slug, field, query))
  )
  if (dimension === "status") return statusCounts
  return Result.isSuccess(result) ? result.value : null
}

type PickerDimension = FilterDimension | "status"

export function Filters() {
  const {
    query,
    patchFilter,
    prefetchFilter,
    filters,
    counts,
    boardScope,
    compact
  } = useTicketToolbar()
  return (
    <FilterPicker
      query={query}
      onChange={patchFilter}
      onPrefetch={prefetchFilter}
      filters={filters}
      showStatus={!boardScope}
      counts={counts}
    >
      <ToolbarButton aria-label={m.tickets_filters_add()}>
        <ListFilter className="size-4" strokeWidth={1.75} />
        <CollapsingLabel show={!compact}>
          {m.tickets_filters_add()}
        </CollapsingLabel>
        <Plus className="size-3.5 opacity-60" strokeWidth={1.75} />
      </ToolbarButton>
    </FilterPicker>
  )
}

export function FilterPicker({
  query,
  onChange,
  onPrefetch,
  filters,
  showStatus,
  counts = null,
  initialDimension = null,
  children
}: Readonly<{
  query: TicketFilter
  onChange: (patch: Partial<TicketFilter>) => void
  onPrefetch: (patch: Partial<TicketFilter>) => void
  filters: ReadonlyArray<FilterDimension>
  showStatus: boolean
  counts?: Record<string, number> | null
  initialDimension?: PickerDimension | null
  children: ReactElement
}>) {
  const project = useProject()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] =
    useState<ComponentProps<typeof DropdownMenuContent>["anchor"]>()
  const prefetchItem: NonNullable<
    ComponentProps<typeof DropdownMenu>["onItemHighlighted"]
  > = (item, details) => {
    if (!item || details.reason === "none") return
    const field = item.closest<HTMLElement>("[data-filter-field]")?.dataset
      .filterField
    if (!field) return
    const current = query.rules?.find((rule) => rule.field === field)
    const value = item.dataset.value
    const values =
      value === undefined
        ? undefined
        : toggled(
            current && "values" in current ? current.values : undefined,
            value
          )
    const rule = decodeFilterRule({
      field,
      operator: current?.operator ?? "is",
      values: value === undefined ? undefined : (values ?? [])
    })
    if (Option.isNone(rule)) return
    onPrefetch({
      rules:
        value !== undefined && values === undefined
          ? withoutTicketRule(query, rule.value.field)
          : withTicketRule(query, rule.value)
    })
  }
  const label =
    initialDimension === "status"
      ? m.tickets_filters_section_status()
      : initialDimension
        ? FILTER_DIMENSION_META[initialDimension].label()
        : m.tickets_filters_add()
  const dimensions: ReadonlyArray<PickerDimension> = [
    ...(showStatus ? ["status" as const] : []),
    ...filters.filter(
      (field) =>
        field !== "blocked" &&
        field !== "archived" &&
        (field !== "estimate" ||
          estimateFilterValues(project.estimation).length > 0)
    )
  ]
  return (
    <DropdownMenu
      filterable
      onItemHighlighted={prefetchItem}
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
      <DropdownMenuTrigger ref={triggerRef} render={children} />
      <DropdownMenuContent
        anchor={anchor}
        align="start"
        sideOffset={6}
        className="w-64 max-w-[calc(100vw-2rem)]"
        aria-label={label}
      >
        {initialDimension ? (
          <FilterValues
            dimension={initialDimension}
            query={query}
            onChange={onChange}
            counts={counts}
            label={label}
          />
        ) : (
          <>
            <DropdownMenuInput
              placeholder={m.tickets_filters_search_fields()}
              aria-label={m.tickets_filters_search_fields()}
            />
            <DropdownMenuList>
              {dimensions.map((dimension) => {
                const meta =
                  dimension === "status"
                    ? {
                        label: m.tickets_filters_section_status,
                        icon: CircleDot
                      }
                    : FILTER_DIMENSION_META[dimension]
                const Icon = meta.icon
                return (
                  <DropdownMenuSub
                    key={dimension}
                    filterable
                    onItemHighlighted={prefetchItem}
                  >
                    <DropdownMenuSubTrigger label={meta.label()}>
                      <Icon className="size-4" />
                      {meta.label()}
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="w-64 max-w-[calc(100vw-2rem)]">
                      <FilterValues
                        dimension={dimension}
                        query={query}
                        onChange={onChange}
                        counts={counts}
                        label={meta.label()}
                      />
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )
              })}
              {filters.some(
                (field) => field === "blocked" || field === "archived"
              ) && <DropdownMenuSeparator />}
              {filters.flatMap((field) => {
                if (field !== "blocked" && field !== "archived") return []
                const meta = FILTER_DIMENSION_META[field]
                const Icon = meta.icon
                return [
                  <DropdownMenuItem
                    key={field}
                    label={meta.label()}
                    data-filter-field={field}
                    onClick={() =>
                      onChange({
                        rules: withTicketRule(
                          query,
                          ticketRule(query, field) ?? { field, operator: "is" }
                        )
                      })
                    }
                  >
                    <Icon className="size-4" />
                    {meta.label()}
                  </DropdownMenuItem>
                ]
              })}
            </DropdownMenuList>
            <DropdownMenuEmpty>
              {m.tickets_filters_search_empty()}
            </DropdownMenuEmpty>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FilterValues({
  dimension,
  query,
  onChange,
  counts,
  label
}: Readonly<{
  dimension: PickerDimension
  query: TicketFilter
  onChange: (patch: Partial<TicketFilter>) => void
  counts: Record<string, number> | null
  label: string
}>) {
  const project = useProject()
  const dimensionCounts = useDimensionCounts(dimension, query, counts)
  return (
    <>
      <DropdownMenuInput
        placeholder={m.tickets_filters_search_values({ dimension: label })}
        aria-label={m.tickets_filters_search_values({ dimension: label })}
      />
      <DropdownMenuList
        className="max-h-72 overflow-y-auto"
        data-filter-field={dimension}
      >
        {dimension === "status" && (
          <FilterStatus
            value={ticketRule(query, "status")?.values}
            onChange={(values) =>
              onChange({
                rules: values
                  ? withTicketRule(query, {
                      field: "status",
                      operator: ticketRule(query, "status")?.operator ?? "is",
                      values
                    })
                  : withoutTicketRule(query, "status")
              })
            }
            counts={dimensionCounts}
          />
        )}
        {dimension === "type" && (
          <FilterType
            value={ticketRule(query, "type")?.values}
            onChange={(values) =>
              onChange({
                rules: values
                  ? withTicketRule(query, {
                      field: "type",
                      operator: ticketRule(query, "type")?.operator ?? "is",
                      values
                    })
                  : withoutTicketRule(query, "type")
              })
            }
            counts={dimensionCounts}
          />
        )}
        {dimension === "assignee" && (
          <FilterAssignee
            value={ticketRule(query, "assignee")?.values}
            onChange={(values) =>
              onChange({
                rules: values
                  ? withTicketRule(query, {
                      field: "assignee",
                      operator: ticketRule(query, "assignee")?.operator ?? "is",
                      values
                    })
                  : withoutTicketRule(query, "assignee")
              })
            }
            members={project.members}
            counts={dimensionCounts}
          />
        )}
        {dimension === "sprint" && (
          <FilterSprint
            value={ticketRule(query, "sprint")?.values}
            onChange={(values) =>
              onChange({
                rules: values
                  ? withTicketRule(query, {
                      field: "sprint",
                      operator: ticketRule(query, "sprint")?.operator ?? "is",
                      values
                    })
                  : withoutTicketRule(query, "sprint")
              })
            }
            counts={dimensionCounts}
          />
        )}
        {dimension === "estimate" && (
          <FilterEstimate
            value={ticketRule(query, "estimate")?.values}
            onChange={(values) =>
              onChange({
                rules: values
                  ? withTicketRule(query, {
                      field: "estimate",
                      operator: ticketRule(query, "estimate")?.operator ?? "is",
                      values
                    })
                  : withoutTicketRule(query, "estimate")
              })
            }
            estimation={project.estimation}
            counts={dimensionCounts}
          />
        )}
        {dimension === "tags" && (
          <FilterTags
            value={ticketRule(query, "tags")?.values}
            onChange={(values) =>
              onChange({
                rules: values
                  ? withTicketRule(query, {
                      field: "tags",
                      operator: ticketRule(query, "tags")?.operator ?? "is",
                      values
                    })
                  : withoutTicketRule(query, "tags")
              })
            }
            counts={dimensionCounts}
          />
        )}
      </DropdownMenuList>
      <DropdownMenuEmpty>{m.tickets_filters_search_empty()}</DropdownMenuEmpty>
    </>
  )
}

type CheckOption<A extends string> = Readonly<{
  value: A
  label: string
  content: ReactElement
  separated?: boolean
}>

function CheckboxOptions<A extends string>({
  options,
  selected,
  onChange,
  counts
}: Readonly<{
  options: ReadonlyArray<CheckOption<A>>
  selected: ReadonlyArray<A> | undefined
  onChange: (next: ReadonlyArray<A> | undefined) => void
  counts: Counts
}>) {
  return (
    <>
      {options.map((option) => (
        <Fragment key={option.value}>
          <CheckboxMenuItem
            label={option.label}
            value={option.value}
            checked={selected?.includes(option.value) === true}
            onToggle={() => onChange(toggled(selected, option.value))}
          >
            {option.content}
            {counts && (
              <span data-menu-meta className={menuItemMetaClass}>
                {counts[option.value] ?? 0}
              </span>
            )}
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
  value:
    | Extract<TicketFilterRule, Readonly<{ field: "status" }>>["values"]
    | undefined
  onChange: (
    value:
      | Extract<TicketFilterRule, Readonly<{ field: "status" }>>["values"]
      | undefined
  ) => void
  counts: Counts
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const statuses = Result.isSuccess(result) ? result.value : []
  return (
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
            </>
          )
        }
      })}
      counts={counts}
    />
  )
}

function FilterType({
  value,
  onChange,
  counts
}: Readonly<{
  value:
    | Extract<TicketFilterRule, Readonly<{ field: "type" }>>["values"]
    | undefined
  onChange: (
    value:
      | Extract<TicketFilterRule, Readonly<{ field: "type" }>>["values"]
      | undefined
  ) => void
  counts: Counts
}>) {
  return (
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
      counts={counts}
    />
  )
}

function FilterAssignee({
  value,
  onChange,
  members,
  counts
}: Readonly<{
  value:
    | Extract<TicketFilterRule, Readonly<{ field: "assignee" }>>["values"]
    | undefined
  onChange: (
    value:
      | Extract<TicketFilterRule, Readonly<{ field: "assignee" }>>["values"]
      | undefined
  ) => void
  members: ReadonlyArray<Member>
  counts: Counts
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
    <CheckboxOptions
      selected={value}
      onChange={onChange}
      options={options}
      counts={
        counts && viewerId ? { ...counts, mine: counts[viewerId] ?? 0 } : counts
      }
    />
  )
}

function FilterEstimate({
  value,
  onChange,
  estimation,
  counts
}: Readonly<{
  value:
    | Extract<TicketFilterRule, Readonly<{ field: "estimate" }>>["values"]
    | undefined
  onChange: (
    value:
      | Extract<TicketFilterRule, Readonly<{ field: "estimate" }>>["values"]
      | undefined
  ) => void
  estimation: EstimationMode
  counts: Counts
}>) {
  const options = estimateFilterValues(estimation)
  if (options.length === 0) return null
  return (
    <CheckboxOptions
      selected={value}
      onChange={onChange}
      options={options.map((option) => ({
        value: option,
        label: estimateFilterLabel(option),
        content: text(estimateFilterLabel(option))
      }))}
      counts={counts}
    />
  )
}

function FilterSprint({
  value,
  onChange,
  counts
}: Readonly<{
  value:
    | Extract<TicketFilterRule, Readonly<{ field: "sprint" }>>["values"]
    | undefined
  onChange: (
    value:
      | Extract<TicketFilterRule, Readonly<{ field: "sprint" }>>["values"]
      | undefined
  ) => void
  counts: Counts
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const sprintsList = useAtomValue(sprintList(sprintListRequest(orgSlug, slug)))
  const allSprints = Result.isSuccess(sprintsList) ? sprintsList.value : []
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const sprintOptions = filterableSprints(allSprints, now, value)
  return (
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
      counts={counts}
    />
  )
}

function FilterTags({
  value,
  onChange,
  counts
}: Readonly<{
  value:
    | Extract<TicketFilterRule, Readonly<{ field: "tags" }>>["values"]
    | undefined
  onChange: (
    value:
      | Extract<TicketFilterRule, Readonly<{ field: "tags" }>>["values"]
      | undefined
  ) => void
  counts: Counts
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const tags = useAtomValue(tagsFor(tagsRequest(orgSlug, slug)))
  const tagList = useMemo(
    () => (Result.isSuccess(tags) ? sortTagsByColor(tags.value) : []),
    [tags]
  )
  if (tagList.length === 0) return null
  return (
    <>
      {tagList.map((tag) => (
        <TagMenuItem
          key={tag.name}
          tag={tag}
          checked={value?.includes(tag.name) === true}
          onToggle={() => onChange(toggled(value, tag.name))}
          count={counts ? (counts[tag.name] ?? 0) : undefined}
        />
      ))}
    </>
  )
}
