import { Button } from "@pp/ui/button"
import {
  CommandMenu,
  CommandMenuDialog,
  CommandMenuEmpty,
  CommandMenuInput,
  CommandMenuItem,
  CommandMenuList,
  CommandMenuShortcut,
  type CommandMenuItemData,
  type KeyLabels
} from "@pp/ui/command-menu"
import {
  CircleDashed,
  Link,
  ListTodo,
  Moon,
  Signal,
  UserPlus
} from "lucide-react"
import { useState } from "react"

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

type Command = CommandMenuItemData & Readonly<{ shortcut?: string }>

const COMMANDS: ReadonlyArray<Command> = [
  {
    value: "status",
    label: "Change status…",
    icon: CircleDashed,
    group: "PP-214",
    shortcut: "s"
  },
  {
    value: "assign",
    label: "Assign to…",
    icon: UserPlus,
    group: "PP-214",
    shortcut: "a"
  },
  {
    value: "priority",
    label: "Set priority…",
    icon: Signal,
    group: "PP-214",
    shortcut: "p"
  },
  {
    value: "link",
    label: "Copy link",
    icon: Link,
    group: "PP-214",
    shortcut: "mod+shift+c"
  },
  {
    value: "backlog",
    label: "Go to backlog",
    icon: ListTodo,
    group: "Navigation"
  },
  { value: "theme", label: "Switch theme…", icon: Moon, group: "Preferences" }
]

const SHORTCUTS = new Map(
  COMMANDS.map((command) => [command.value, command.shortcut] as const)
)

export default function Palette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const needle = query.trim().toLowerCase()
  const shown = COMMANDS.filter((item) =>
    item.label.toLowerCase().includes(needle)
  )
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open command menu
      </Button>
      <CommandMenuDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery("")
        }}
        shortcut={null}
        title="Command menu"
      >
        <CommandMenu
          stretch
          className="flex min-h-0 flex-1 flex-col [&_.scroll-divider]:border-t-0"
          items={shown}
          resetKey={needle}
          onSelect={() => setOpen(false)}
        >
          <div className="border-b border-border/60">
            <CommandMenuInput
              aria-label="Search commands"
              placeholder="Type a command or search…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <CommandMenuList
            aria-label="Commands"
            renderItem={(item) => {
              const shortcut = SHORTCUTS.get(item.value)
              return (
                <CommandMenuItem value={item.value}>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {shortcut !== undefined && (
                    <CommandMenuShortcut
                      keys={shortcut}
                      keyLabels={KEY_LABELS}
                    />
                  )}
                </CommandMenuItem>
              )
            }}
          >
            <CommandMenuEmpty>No commands match “{query}”</CommandMenuEmpty>
          </CommandMenuList>
        </CommandMenu>
      </CommandMenuDialog>
    </>
  )
}
