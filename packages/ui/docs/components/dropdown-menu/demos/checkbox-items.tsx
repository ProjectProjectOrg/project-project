import { Button } from "@pp/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { menuItemMetaClass } from "@pp/ui/menu-styles"
import {
  Check,
  Circle,
  CircleDashed,
  CircleDot,
  GitPullRequest,
  type LucideIcon
} from "lucide-react"
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
  icon: LucideIcon
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

export default function CheckboxItems() {
  return (
    <div className="flex items-start gap-6">
      <TagMenu />
      <ColumnMenu />
    </div>
  )
}
