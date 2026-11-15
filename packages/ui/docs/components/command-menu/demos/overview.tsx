import {
  CommandMenu,
  CommandMenuCheck,
  CommandMenuEmpty,
  CommandMenuFooter,
  CommandMenuFooterHint,
  CommandMenuInput,
  CommandMenuItem,
  CommandMenuList,
  CommandMenuShortcut,
  CommandMenuTabs,
  type CommandMenuItemData,
  type KeyLabels
} from "@pp/ui/command-menu"
import {
  Archive,
  CircleDashed,
  Link,
  ListTodo,
  Settings,
  Signal,
  UserPlus
} from "@pp/ui/icons"
import { useState, type ReactNode } from "react"

const KEY_LABELS: KeyLabels = {
  ctrl: "Ctrl",
  meta: "Win",
  alt: "Alt",
  shift: "Shift",
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  space: "Space"
}

type Row = CommandMenuItemData &
  Readonly<{ shortcut?: string; checked?: boolean }>

const ROWS: ReadonlyArray<Row> = [
  {
    value: "status",
    label: "Highlighted",
    icon: CircleDashed,
    group: "Ticket",
    shortcut: "s"
  },
  { value: "assign", label: "Default", icon: UserPlus, group: "Ticket" },
  {
    value: "priority",
    label: "With shortcut",
    icon: Signal,
    group: "Ticket",
    shortcut: "mod+shift+p"
  },
  {
    value: "link",
    label: "Checked",
    icon: Link,
    group: "Ticket",
    checked: true
  },
  {
    value: "archive",
    label: "Disabled",
    icon: Archive,
    group: "Ticket",
    disabled: true
  },
  {
    value: "backlog",
    label: "Backlog",
    icon: ListTodo,
    group: "Go to",
    shortcut: "g+b"
  },
  {
    value: "settings",
    label: "Project settings",
    icon: Settings,
    group: "Go to"
  }
]

const TABS = [
  { value: "all", label: "All", count: 7 },
  { value: "ticket", label: "Ticket", count: 5 },
  { value: "go", label: "Go to", count: 2 }
]

function Panel({
  label,
  children
}: Readonly<{ label: string; children: ReactNode }>) {
  return (
    <div className="grid gap-2">
      <span className="text-caption text-muted-foreground">{label}</span>
      <div className="flex max-h-[26rem] w-[30rem] max-w-full flex-col overflow-hidden rounded-[20px] border border-border/60 bg-popover text-foreground [corner-shape:var(--button-corner)]">
        {children}
      </div>
    </div>
  )
}

function Palette({
  rows,
  initialQuery = ""
}: Readonly<{ rows: ReadonlyArray<Row>; initialQuery?: string }>) {
  const [query, setQuery] = useState(initialQuery)
  const [tab, setTab] = useState("all")
  const byValue = new Map(rows.map((row) => [row.value, row] as const))
  const needle = query.trim().toLowerCase()
  const shown = rows.filter(
    (row) =>
      row.label.toLowerCase().includes(needle) &&
      (tab === "all" || (tab === "ticket") === (row.group === "Ticket"))
  )
  return (
    <CommandMenu items={shown} resetKey={`${tab}:${needle}`}>
      <CommandMenuTabs
        tabsLabel="Command groups"
        tabs={TABS}
        value={tab}
        onValueChange={setTab}
      />
      <CommandMenuInput
        aria-label="Search commands"
        placeholder="Type a command or search…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <CommandMenuList
        aria-label="Commands"
        renderItem={(item) => {
          const row = byValue.get(item.value)
          return (
            <CommandMenuItem value={item.value}>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {row?.checked === true && <CommandMenuCheck label="Selected" />}
              {row?.shortcut !== undefined && (
                <CommandMenuShortcut
                  keys={row.shortcut}
                  keyLabels={KEY_LABELS}
                />
              )}
            </CommandMenuItem>
          )
        }}
      >
        <CommandMenuEmpty>No commands match “{query}”</CommandMenuEmpty>
      </CommandMenuList>
      <CommandMenuFooter className="border-t border-border/60">
        <CommandMenuFooterHint
          label="Select"
          keys={["up", "down"]}
          keyLabels={KEY_LABELS}
        />
        <CommandMenuFooterHint
          label="Run"
          keys="enter"
          keyLabels={KEY_LABELS}
        />
        <span className="ml-auto flex items-center gap-4">
          <CommandMenuFooterHint
            label="Actions"
            keys="tab"
            keyLabels={KEY_LABELS}
          />
          <CommandMenuFooterHint
            label="Peek"
            keys="arrowright"
            keyLabels={KEY_LABELS}
          />
        </span>
      </CommandMenuFooter>
    </CommandMenu>
  )
}

export default function Overview() {
  return (
    <div className="flex flex-wrap items-start gap-8">
      <Panel label="Tabs, groups, rows, shortcuts, footer">
        <Palette rows={ROWS} />
      </Panel>
      <Panel label="No results">
        <Palette rows={ROWS} initialQuery="zebra" />
      </Panel>
    </div>
  )
}
