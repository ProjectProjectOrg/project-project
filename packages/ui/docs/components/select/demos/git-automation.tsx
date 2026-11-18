import {
  Check,
  Circle,
  CircleDashed,
  CircleDot,
  GitBranch,
  GitMerge,
  GitPullRequest,
  Minus,
  type IconType
} from "@pp/ui/icons"
import { Select, SelectTrigger } from "@pp/ui/select"
import { useState, type ReactNode } from "react"

const STATUSES = [
  {
    slug: "backlog",
    label: "Backlog",
    icon: CircleDashed,
    tone: "text-muted-foreground"
  },
  { slug: "todo", label: "Todo", icon: Circle, tone: "text-muted-foreground" },
  {
    slug: "in-progress",
    label: "In progress",
    icon: CircleDot,
    tone: "text-state-info"
  },
  {
    slug: "in-review",
    label: "In review",
    icon: GitPullRequest,
    tone: "text-state-merged"
  },
  { slug: "done", label: "Done", icon: Check, tone: "text-state-success" }
] as const

const DONT_MOVE = "dont-move"

const RULES: ReadonlyArray<
  Readonly<{
    id: string
    label: string
    hint: string
    icon: IconType
    target: string
  }>
> = [
  {
    id: "branch",
    label: "Branch linked",
    hint: "Created, attached or linked automatically",
    icon: GitBranch,
    target: "in-progress"
  },
  {
    id: "opened",
    label: "Pull request opened",
    hint: "Opened, reopened or marked ready for review",
    icon: GitPullRequest,
    target: "in-review"
  },
  {
    id: "merged",
    label: "Pull request merged",
    hint: "Into the default branch",
    icon: GitMerge,
    target: DONT_MOVE
  }
]

function Option({
  icon: Icon,
  tone,
  children
}: Readonly<{ icon: IconType; tone: string; children: ReactNode }>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className={`size-4 shrink-0 ${tone}`} strokeWidth={1.75} />
      <span className="truncate">{children}</span>
    </span>
  )
}

const optionFor = (value: string) => {
  const status = STATUSES.find((s) => s.slug === value)
  return status ? (
    <Option icon={status.icon} tone={status.tone}>
      {status.label}
    </Option>
  ) : (
    <span className="text-muted-foreground">
      <Option icon={Minus} tone="">
        Don&apos;t move
      </Option>
    </span>
  )
}

const ITEMS = [
  {
    value: DONT_MOVE,
    textValue: "Don't move",
    separated: true,
    label: optionFor(DONT_MOVE)
  },
  ...STATUSES.map((status) => ({
    value: status.slug,
    textValue: status.label,
    label: optionFor(status.slug)
  }))
]

// The Git automation settings: one row per Git event, each with a select of
// the project's statuses plus "Don't move". The trigger shows the same icon
// and label as the row it picked.
export default function GitAutomation() {
  const [targets, setTargets] = useState<Readonly<Record<string, string>>>(
    Object.fromEntries(RULES.map((rule) => [rule.id, rule.target]))
  )
  return (
    <div className="w-full max-w-xl divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {RULES.map(({ id, label, hint, icon: Icon }) => (
        <div key={id} className="flex min-h-14 items-center gap-x-4 px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Icon
              className="size-4 shrink-0 text-muted-foreground"
              strokeWidth={1.75}
            />
            <div className="min-w-0">
              <p className="text-body leading-tight font-semibold">{label}</p>
              <p className="mt-0.5 text-caption text-muted-foreground">
                {hint}
              </p>
            </div>
          </div>
          <Select
            items={ITEMS}
            value={targets[id] ?? DONT_MOVE}
            onValueChange={(next: string) =>
              setTargets((current) => ({ ...current, [id]: next }))
            }
            contentProps={{ align: "end", className: "w-48" }}
          >
            <SelectTrigger
              aria-label={label}
              className="w-44"
              selectedLabel={optionFor(targets[id] ?? DONT_MOVE)}
            />
          </Select>
        </div>
      ))}
    </div>
  )
}
