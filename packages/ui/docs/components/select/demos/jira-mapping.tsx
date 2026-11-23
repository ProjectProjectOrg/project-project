import {
  ArrowRight,
  Check,
  Circle,
  CircleDot,
  GitPullRequest,
  Plus,
  type IconType
} from "@pp/ui/icons"
import { Select, SelectTrigger, type SelectOption } from "@pp/ui/select"
import { useState, type ReactNode } from "react"

const PROJECT_STATUSES = [
  { slug: "todo", label: "Todo", icon: Circle },
  { slug: "in-progress", label: "In progress", icon: CircleDot },
  { slug: "in-review", label: "In review", icon: GitPullRequest },
  { slug: "done", label: "Done", icon: Check }
] as const

const JIRA_STATUSES = [
  { id: "10001", name: "To Do", mapped: "todo" },
  { id: "10002", name: "In Progress", mapped: "in-progress" },
  { id: "10003", name: "QA", mapped: null },
  { id: "10004", name: "Done", mapped: "done" }
] as const

const CREATE = "create"

function OptionLabel({
  icon: Icon,
  children
}: Readonly<{ icon: IconType; children: ReactNode }>) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon className="size-3.5 shrink-0" strokeWidth={1.75} />
      <span className="truncate">{children}</span>
    </span>
  )
}

// The Jira import's status mapping: one compact select per Jira status, a
// placeholder while a status is unmapped, and a last row that creates a
// matching status instead of picking an existing one.
export default function JiraMapping() {
  const [choices, setChoices] = useState<
    Readonly<Record<string, string | null>>
  >(Object.fromEntries(JIRA_STATUSES.map((s) => [s.id, s.mapped])))
  return (
    <div className="w-full max-w-lg overflow-hidden rounded-lg border border-border surface-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 border-b border-border px-4 py-2 text-caption text-muted-foreground">
        <span>Jira status</span>
        <span />
        <span>Becomes</span>
      </div>
      {JIRA_STATUSES.map((jira) => {
        const value = choices[jira.id] ?? null
        const createLabel = `Create “${jira.name}”`
        const selected = PROJECT_STATUSES.find((s) => s.slug === value)
        const items: ReadonlyArray<SelectOption<string>> = [
          ...PROJECT_STATUSES.map((status, index) => ({
            value: status.slug,
            textValue: status.label,
            separated: index === PROJECT_STATUSES.length - 1,
            label: <OptionLabel icon={status.icon}>{status.label}</OptionLabel>
          })),
          {
            value: CREATE,
            textValue: createLabel,
            label: <OptionLabel icon={Plus}>{createLabel}</OptionLabel>
          }
        ]
        return (
          <div
            key={jira.id}
            className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 border-b border-border px-4 py-2 last:border-0"
          >
            <span className="truncate text-body">{jira.name}</span>
            <ArrowRight
              className="size-3.5 text-muted-foreground"
              strokeWidth={1.75}
            />
            <Select
              size="compact"
              value={value}
              onValueChange={(next: string) =>
                setChoices((current) => ({ ...current, [jira.id]: next }))
              }
              items={items}
            >
              <SelectTrigger
                size="compact"
                aria-label={jira.name}
                placeholder="Choose…"
                className="w-full"
                selectedLabel={
                  value === CREATE ? (
                    <OptionLabel icon={Plus}>{createLabel}</OptionLabel>
                  ) : selected ? (
                    <OptionLabel icon={selected.icon}>
                      {selected.label}
                    </OptionLabel>
                  ) : undefined
                }
              />
            </Select>
          </div>
        )
      })}
    </div>
  )
}
