import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import {
  Check,
  Circle,
  CircleDashed,
  CircleDot,
  GitPullRequest,
  type IconType
} from "@pp/ui/icons"
import { menuItemMetaClass } from "@pp/ui/menu-styles"
import { useState } from "react"

const TAGS = [
  { name: "bug", color: "oklch(0.7 0.16 15)" },
  { name: "frontend", color: "oklch(0.7 0.16 255)" },
  { name: "backend", color: "oklch(0.7 0.16 165)" },
  { name: "design", color: "oklch(0.7 0.16 315)" },
  { name: "needs-review", color: "oklch(0.7 0.16 75)" },
  { name: "performance", color: "oklch(0.7 0.16 45)" }
] as const

type Column = Readonly<{
  label: string
  icon: IconType
  className: string
  count: number
}>

const COLUMNS: ReadonlyArray<Column> = [
  {
    label: "Backlog",
    icon: CircleDashed,
    className: "text-muted-foreground",
    count: 12
  },
  { label: "Todo", icon: Circle, className: "text-muted-foreground", count: 8 },
  {
    label: "In progress",
    icon: CircleDot,
    className: "text-state-info",
    count: 5
  },
  {
    label: "In review",
    icon: GitPullRequest,
    className: "text-state-merged",
    count: 3
  },
  { label: "Done", icon: Check, className: "text-state-success", count: 41 }
]

const USER_TOGGLES = new Set(["trigger-press", "escape-key"])

function useOverviewMenu() {
  const [open, setOpen] = useState(true)
  const onOpenChange = (
    next: boolean,
    details: Readonly<{ reason: string }>
  ) => {
    if (USER_TOGGLES.has(details.reason)) setOpen(next)
  }
  return { open, onOpenChange }
}

const toggled = (set: ReadonlySet<string>, key: string) => {
  const next = new Set(set)
  if (!next.delete(key)) next.add(key)
  return next
}

function TagMenu() {
  const menu = useOverviewMenu()
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(["frontend", "design", "needs-review"])
  )
  return (
    <DropdownMenu {...menu} modal={false}>
      <DropdownMenuTrigger
        render={<Button variant="secondary" className="w-56" />}
      >
        Tags
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {TAGS.map((tag) => (
          <DropdownMenuCheckboxItem
            key={tag.name}
            label={tag.name}
            checked={checked.has(tag.name)}
            closeOnClick={false}
            onCheckedChange={() => setChecked(toggled(checked, tag.name))}
          >
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: tag.color }}
            />
            <span className="min-w-0 truncate">{tag.name}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ColumnMenu() {
  const menu = useOverviewMenu()
  const [checked, setChecked] = useState<ReadonlySet<string>>(
    () => new Set(["Todo", "In progress", "In review"])
  )
  return (
    <DropdownMenu {...menu} modal={false}>
      <DropdownMenuTrigger
        render={<Button variant="secondary" className="w-56" />}
      >
        Board columns
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {COLUMNS.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.label}
            label={column.label}
            checked={checked.has(column.label)}
            closeOnClick={false}
            onCheckedChange={() => setChecked(toggled(checked, column.label))}
          >
            <column.icon
              className={`size-4 ${column.className}`}
              strokeWidth={1.75}
            />
            <span className="min-w-0 truncate">{column.label}</span>
            <span data-menu-meta className={menuItemMetaClass}>
              {column.count}
            </span>
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuCheckboxItem label="Archived" checked={false} disabled>
          <span className="min-w-0 truncate">Archived</span>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

type TagState = "on" | "off" | "mixed"

// How many of four selected tickets carry each tag.
const ON_SELECTION: Readonly<Record<string, number>> = {
  bug: 4,
  frontend: 2,
  backend: 0,
  design: 1,
  "needs-review": 0,
  performance: 3
}

const stateOf = (count: number) =>
  (count === 0 ? "off" : count === 4 ? "on" : "mixed") satisfies TagState

// Labels on a selection of tickets: a tag on some of them is mixed (a
// dash). A click puts it on all of them, then on none, then back to mixed.
function SelectionTagMenu() {
  const menu = useOverviewMenu()
  const [states, setStates] = useState<Readonly<Record<string, TagState>>>(() =>
    Object.fromEntries(
      TAGS.map((tag) => [tag.name, stateOf(ON_SELECTION[tag.name] ?? 0)])
    )
  )
  const cycle = (name: string) =>
    setStates((current) => {
      const start = stateOf(ON_SELECTION[name] ?? 0)
      const now = current[name] ?? start
      const after = new Map<TagState, TagState>([
        ["mixed", "on"],
        ["on", "off"],
        ["off", start === "mixed" ? "mixed" : "on"]
      ])
      return { ...current, [name]: after.get(now) ?? start }
    })
  return (
    <DropdownMenu {...menu} modal={false}>
      <DropdownMenuTrigger
        render={<Button variant="secondary" className="w-56" />}
      >
        Labels on 4 tickets
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {TAGS.map((tag) => {
          const state = states[tag.name] ?? "off"
          return (
            <DropdownMenuCheckboxItem
              key={tag.name}
              label={tag.name}
              checked={state === "on"}
              mixed={state === "mixed"}
              closeOnClick={false}
              onCheckedChange={() => cycle(tag.name)}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="min-w-0 truncate">{tag.name}</span>
              <span data-menu-meta className={menuItemMetaClass}>
                {ON_SELECTION[tag.name] ?? 0}
              </span>
            </DropdownMenuCheckboxItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function CheckboxItems() {
  return (
    <div className="flex flex-wrap items-start gap-6">
      <TagMenu />
      <ColumnMenu />
      <SelectionTagMenu />
    </div>
  )
}
