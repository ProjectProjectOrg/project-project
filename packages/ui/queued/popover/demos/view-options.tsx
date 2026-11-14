import { Button } from "@pp/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import { Select, SelectTrigger } from "@pp/ui/select"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Columns3,
  Rows3,
  SlidersHorizontal
} from "lucide-react"
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
  const [grouping, setGrouping] = useState<Grouping>("status")
  const [ordering, setOrdering] = useState<Ordering>("updated")
  const [ascending, setAscending] = useState(false)
  const [shown, setShown] = useState<ReadonlySet<string>>(DEFAULT_SHOWN)
  const isDefault =
    shown.size === DEFAULT_SHOWN.size &&
    [...shown].every((property) => DEFAULT_SHOWN.has(property))
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
            <button
              type="button"
              aria-label="View options"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-body text-muted-foreground transition-[color,background-color,scale] duration-100 outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.97] data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
            />
          }
        >
          <SlidersHorizontal className="size-4" strokeWidth={1.75} />
          View options
          <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
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
              <div className="flex min-h-7 items-center justify-between gap-3">
                <h3 className="text-body text-muted-foreground">
                  Display properties
                </h3>
                {!isDefault && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShown(DEFAULT_SHOWN)}
                  >
                    Reset
                  </Button>
                )}
              </div>
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
        </PopoverContent>
      </Popover>
    </div>
  )
}
