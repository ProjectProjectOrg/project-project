import { useAtomValue } from "@effect/atom-react"
import {
  ticketRule,
  withoutTicketRule,
  withTicketRule,
  type TicketFilter,
  type TicketListQuery
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { CircleDot, Plus, X } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import type { CSSProperties } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup
} from "@/components/ui/dropdown-menu"
import { MemberAvatar } from "@/features/members/components/MemberAvatar"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  FILTER_DIMENSION_META,
  useFilterOptions,
  type FilterVisual
} from "@/features/tickets/hooks/useFilterOptions"
import {
  statusLabelFor,
  statusMetaFor
} from "@/features/tickets/lib/ticketMeta"
import type { IconComponent } from "@/lib/icon"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { FilterPicker } from "./Filters"
import type { FilterDimension } from "./model"

export function FilterChips({
  query,
  shownQuery,
  filters,
  showStatus,
  counts,
  onQueryChange,
  onQueryPrefetch
}: Readonly<{
  query: TicketListQuery
  shownQuery: TicketListQuery | null
  filters: ReadonlyArray<FilterDimension>
  showStatus: boolean
  counts: Record<string, number> | null
  onQueryChange: (query: TicketListQuery) => void
  onQueryPrefetch: (query: TicketListQuery) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const dimensions = [
    ...new Set([
      ...filters,
      ...(shownQuery?.rules ?? []).flatMap((rule) =>
        rule.field === "status" ? [] : [rule.field]
      )
    ])
  ]
  const options = useFilterOptions(dimensions, shownQuery ?? query)
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, slug))
  )
  const statuses = Result.isSuccess(statusesResult) ? statusesResult.value : []
  const reduceMotion = useReducedMotion()
  const rules =
    shownQuery?.rules?.filter(
      (rule) => rule.field !== "status" || showStatus
    ) ?? []
  const patchFilter = (patch: Partial<TicketFilter>) =>
    onQueryChange({ ...query, ...patch, cursor: undefined })
  const prefetchFilter = (patch: Partial<TicketFilter>) =>
    onQueryPrefetch({ ...query, ...patch, cursor: undefined })
  if (rules.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <AnimatePresence initial={false}>
        {rules.map((rule) => {
          const boolean = rule.field === "archived" || rule.field === "blocked"
          const meta =
            rule.field === "status"
              ? { label: m.tickets_filters_section_status, icon: CircleDot }
              : FILTER_DIMENSION_META[rule.field]
          const Icon = meta.icon
          const values: ReadonlyArray<ValueItem> =
            "values" in rule
              ? rule.values.map((value) => {
                  if (rule.field === "status") {
                    const status = statusMetaFor(value, statuses)
                    return {
                      label: statusLabelFor(value, statuses),
                      visual: {
                        kind: "icon",
                        icon: status.icon,
                        className: status.className,
                        color: status.color ?? undefined
                      }
                    }
                  }
                  const option = options.find(
                    (option) =>
                      option.choice.dimension === rule.field &&
                      "value" in option.choice &&
                      option.choice.value === value
                  )
                  return {
                    label: option?.label ?? value,
                    visual: option?.visual
                  }
                })
              : [
                  {
                    label:
                      rule.field === "archived"
                        ? m.tickets_filters_value_archived()
                        : m.tickets_filters_value_blocked()
                  }
                ]
          const positive =
            rule.field === "tags"
              ? values.length > 1
                ? m.tickets_filters_operator_include_any()
                : m.tickets_filters_operator_include()
              : values.length > 1
                ? m.tickets_filters_operator_is_any()
                : m.tickets_filters_operator_is()
          const negative =
            rule.field === "tags"
              ? values.length > 1
                ? m.tickets_filters_operator_include_none()
                : m.tickets_filters_operator_not_include()
              : values.length > 1
                ? m.tickets_filters_operator_is_none()
                : m.tickets_filters_operator_is_not()
          return (
            <motion.span
              key={rule.field}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.97 }}
              transition={reduceMotion ? { duration: 0 } : transitions.fade}
              className="inline-flex h-7 max-w-full items-center rounded-full border border-border text-caption"
            >
              <span className="inline-flex shrink-0 items-center gap-1.5 px-2 text-muted-foreground">
                <Icon className="size-3.5" />
                {boolean ? m.tickets_filters_subject_ticket() : meta.label()}
              </span>
              <DropdownMenu
                onItemHighlighted={(item, details) => {
                  const operator = item?.dataset.value
                  if (
                    details.reason === "none" ||
                    (operator !== "is" && operator !== "isNot")
                  )
                    return
                  prefetchFilter({
                    rules: withTicketRule(query, {
                      ...(ticketRule(query, rule.field) ?? rule),
                      operator
                    })
                  })
                }}
              >
                <DropdownMenuTrigger
                  render={
                    <Button variant="filter-operator">
                      {rule.operator === "is" ? positive : negative}
                    </Button>
                  }
                />
                <DropdownMenuContent align="start" sideOffset={6}>
                  <DropdownMenuRadioGroup
                    value={
                      ticketRule(query, rule.field)?.operator ?? rule.operator
                    }
                    items={[
                      { value: "is", label: positive },
                      { value: "isNot", label: negative }
                    ]}
                    onValueChange={(operator) =>
                      patchFilter({
                        rules: withTicketRule(query, {
                          ...(ticketRule(query, rule.field) ?? rule),
                          operator
                        })
                      })
                    }
                  />
                </DropdownMenuContent>
              </DropdownMenu>
              {boolean ? (
                <span className="flex h-full items-center border-l border-border px-2">
                  {values[0]?.label}
                </span>
              ) : (
                <FilterPicker
                  query={query}
                  onChange={patchFilter}
                  onPrefetch={prefetchFilter}
                  filters={filters}
                  showStatus={showStatus}
                  initialDimension={rule.field}
                  counts={counts}
                >
                  <Button variant="filter-value">
                    <FilterValue
                      field={rule.field}
                      icon={Icon}
                      values={values}
                    />
                  </Button>
                </FilterPicker>
              )}
              <Button
                variant="quiet"
                size="icon-xs"
                className="h-full w-7 rounded-none rounded-r-full border-l border-border"
                onClick={() =>
                  patchFilter({ rules: withoutTicketRule(query, rule.field) })
                }
                onPointerEnter={() =>
                  prefetchFilter({
                    rules: withoutTicketRule(query, rule.field)
                  })
                }
                onFocus={() =>
                  prefetchFilter({
                    rules: withoutTicketRule(query, rule.field)
                  })
                }
                aria-label={m.tickets_filters_chip_remove_aria_label({
                  dimension: meta.label()
                })}
              >
                <X />
              </Button>
            </motion.span>
          )
        })}
      </AnimatePresence>
      <FilterPicker
        query={query}
        onChange={patchFilter}
        onPrefetch={prefetchFilter}
        filters={filters}
        showStatus={showStatus}
        counts={counts}
      >
        <Button
          variant="quiet"
          size="square-7"
          className="rounded-full"
          aria-label={m.tickets_filters_add()}
        >
          <Plus className="size-3.5" />
        </Button>
      </FilterPicker>
    </div>
  )
}

type ValueItem = Readonly<{ label: string; visual?: FilterVisual | undefined }>

const COUNT_LABELS = {
  status: m.tickets_filters_value_count_status,
  type: m.tickets_filters_value_count_type,
  assignee: m.tickets_filters_value_count_assignee,
  sprint: m.tickets_filters_value_count_sprint,
  estimate: m.tickets_filters_value_count_estimate,
  tags: m.tickets_filters_value_count_tags
}

const STACK_LIMIT = 3
const VISUAL_SIZE = 16
const STACK_OVERLAP = 4
const STACK_GAP = 1.5

const stackCutout: CSSProperties = {
  mask: `radial-gradient(circle ${VISUAL_SIZE / 2 + STACK_GAP}px at ${
    VISUAL_SIZE * 1.5 - STACK_OVERLAP
  }px 50%, transparent 99%, #000 100%)`
}

function FilterValue({
  field,
  icon,
  values
}: Readonly<{
  field: keyof typeof COUNT_LABELS
  icon: IconComponent
  values: ReadonlyArray<ValueItem>
}>) {
  const visuals = values.flatMap((value) =>
    value.visual ? [value.visual] : []
  )
  const counted = values.length > 1 && visuals.length === values.length
  const stacked = counted && visuals.every((visual) => visual.kind !== "icon")
  const shown: ReadonlyArray<FilterVisual> = stacked
    ? visuals.slice(0, STACK_LIMIT)
    : counted
      ? [{ kind: "icon", icon }]
      : values.length === 1
        ? visuals
        : []
  return (
    <>
      {shown.length > 0 && (
        <span className="flex shrink-0">
          {shown.map((visual, index) => (
            <span
              key={index}
              className="flex shrink-0"
              style={{
                ...(index > 0 && { marginLeft: -STACK_OVERLAP }),
                ...(index < shown.length - 1 && stackCutout)
              }}
            >
              <FilterVisualMark visual={visual} />
            </span>
          ))}
        </span>
      )}
      <span className="max-w-[28ch] truncate">
        {counted
          ? COUNT_LABELS[field]({ count: values.length })
          : values.map((value) => value.label).join(", ")}
      </span>
    </>
  )
}

function FilterVisualMark({ visual }: Readonly<{ visual: FilterVisual }>) {
  switch (visual.kind) {
    case "member":
      return <MemberAvatar member={visual.member} size={VISUAL_SIZE} />
    case "color":
      return (
        <span className="flex size-4 items-center justify-center">
          <span
            className="size-3 rounded-full"
            style={{ backgroundColor: visual.color }}
          />
        </span>
      )
    case "icon": {
      const Icon = visual.icon
      return (
        <span className="flex" style={{ color: visual.color }}>
          <Icon className={cn("size-4", visual.className)} strokeWidth={1.75} />
        </span>
      )
    }
  }
}
