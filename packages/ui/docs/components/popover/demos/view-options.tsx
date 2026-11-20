import { Badge } from "@pp/ui/badge"
import { Button } from "@pp/ui/button"
import { CollapsingLabel } from "@pp/ui/collapsing-label"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Columns3,
  Rows3,
  SlidersHorizontal
} from "@pp/ui/icons"
import {
  Popover,
  PopoverContent,
  PopoverFooter,
  PopoverTrigger
} from "@pp/ui/popover"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import { Select, SelectTrigger } from "@pp/ui/select"
import { TextSwap } from "@pp/ui/text-swap"
import { useState, type ReactNode } from "react"

const USER_TOGGLES = new Set(["trigger-press", "escape-key"])

const GROUPINGS = [
  { value: "status", label: "Status" },
  { value: "epic", label: "Epic" },
  { value: "sprint", label: "Sprint" },
  { value: "none", label: "None" }
] as const

const ORDERINGS = [
  { value: "manual", label: "Manual" },
  { value: "updated", label: "Updated" },
  { value: "created", label: "Created" },
  { value: "priority", label: "Priority" },
  { value: "title", label: "Title" }
] as const

const PROPERTIES = [
  "Blocked by",
  "Blocking",
  "Related",
  "Duplicates",
  "Epic",
  "Tags",
  "Pull requests",
  "Estimate",
  "Assignee"
] as const

const DEFAULT_SHOWN = new Set<string>([
  "Blocked by",
  "Blocking",
  "Epic",
  "Tags",
  "Pull requests",
  "Assignee"
])

type Grouping = (typeof GROUPINGS)[number]["value"]
type Ordering = (typeof ORDERINGS)[number]["value"]

const DEFAULT_GROUPING: Grouping = "sprint"
const DEFAULT_ORDERING: Ordering = "manual"

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every((item) => b.has(item))

function Picker({
  label,
  displayValue,
  action,
  children
}: Readonly<{
  label: string
  displayValue: string
  action?: ReactNode
  children: (trigger: ReactNode) => ReactNode
}>) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-body text-muted-foreground">{label}</span>
      <div className="ml-auto flex items-center gap-1">
        {action}
        {children(
          <SelectTrigger
            aria-label={`${label}: ${displayValue}`}
            selectedLabel={displayValue}
            className="h-8 w-40 min-w-0"
          />
        )}
      </div>
    </div>
  )
}

export default function ViewOptions() {
  const [open, setOpen] = useState(true)
  const [view, setView] = useState<"list" | "board">("list")
  const [grouping, setGrouping] = useState<Grouping>(DEFAULT_GROUPING)
  const [ordering, setOrdering] = useState<Ordering>("updated")
  const [ascending, setAscending] = useState(false)
  const [shown, setShown] = useState<ReadonlySet<string>>(DEFAULT_SHOWN)
  const changedCount = [
    grouping !== DEFAULT_GROUPING,
    ordering !== DEFAULT_ORDERING,
    !sameSet(shown, DEFAULT_SHOWN)
  ].filter(Boolean).length
  const changed = changedCount > 0
  const [shownCount, setShownCount] = useState(changedCount)
  if (changed && changedCount !== shownCount) setShownCount(changedCount)
  const reset = () => {
    setGrouping(DEFAULT_GROUPING)
    setOrdering(DEFAULT_ORDERING)
    setAscending(true)
    setShown(DEFAULT_SHOWN)
  }
  const DirectionIcon = ascending ? ArrowUp : ArrowDown

  const toggle = (property: string) => {
    const next = new Set(shown)
    if (next.has(property)) next.delete(property)
    else next.add(property)
    setShown(next)
  }

  return (
    <div className="flex w-full justify-end">
      <Popover
        open={open}
        onOpenChange={(next, details) => {
          if (USER_TOGGLES.has(details.reason)) setOpen(next)
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="field"
              tone="strong"
              size="lg"
              aria-label={
                changed
                  ? `View options, ${changedCount} changed`
                  : "View options"
              }
              aria-pressed={changed}
              className="gap-2"
            />
          }
        >
          <SlidersHorizontal
            className="size-4 text-muted-foreground transition-colors duration-80 group-hover:text-foreground group-data-[popup-open]:text-foreground"
            strokeWidth={1.75}
          />
          View options{" "}
          <CollapsingLabel show={changed}>
            <Badge variant="count" active>
              <TextSwap speed="fast">{String(shownCount)}</TextSwap>
            </Badge>
          </CollapsingLabel>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-[rotate,color] duration-280 ease-spring group-hover:text-foreground group-data-[popup-open]:rotate-180 group-data-[popup-open]:text-foreground motion-reduce:transition-none"
            strokeWidth={2}
          />
        </PopoverTrigger>
        <PopoverContent
          aria-label="View options"
          align="end"
          side="bottom"
          className="flex max-h-[var(--available-height)] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0"
        >
          <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain p-3">
            <SegmentedTabs
              aria-label="View"
              fill
              value={view}
              onValueChange={setView}
              items={[
                { key: "list", label: "List", icon: Rows3 },
                { key: "board", label: "Board", icon: Columns3 }
              ]}
            />
            <Picker
              label="Grouping"
              displayValue={
                GROUPINGS.find((option) => option.value === grouping)?.label ??
                grouping
              }
            >
              {(trigger) => (
                <Select
                  items={GROUPINGS}
                  value={grouping}
                  onValueChange={setGrouping}
                  contentProps={{ align: "end", className: "w-56" }}
                >
                  {trigger}
                </Select>
              )}
            </Picker>
            <Picker
              label="Ordering"
              displayValue={
                ORDERINGS.find((option) => option.value === ordering)?.label ??
                ordering
              }
              action={
                ordering !== "manual" && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title={ascending ? "Ascending" : "Descending"}
                    aria-label={
                      ascending ? "Sort descending" : "Sort ascending"
                    }
                    onClick={() => setAscending(!ascending)}
                  >
                    <DirectionIcon />
                  </Button>
                )
              }
            >
              {(trigger) => (
                <Select
                  items={ORDERINGS}
                  value={ordering}
                  onValueChange={setOrdering}
                  contentProps={{ align: "end", className: "w-56" }}
                >
                  {trigger}
                </Select>
              )}
            </Picker>
            <section className="space-y-2 border-t border-border/60 pt-3">
              <h3 className="flex min-h-7 items-center text-body text-muted-foreground">
                Display properties
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {PROPERTIES.map((property) => (
                  <Button
                    key={property}
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-pressed={shown.has(property)}
                    onClick={() => toggle(property)}
                  >
                    {property}
                  </Button>
                ))}
              </div>
            </section>
          </div>
          <PopoverFooter show={changed}>
            <Button variant="ghost" size="sm" onClick={reset}>
              Reset view
            </Button>
          </PopoverFooter>
        </PopoverContent>
      </Popover>
    </div>
  )
}
