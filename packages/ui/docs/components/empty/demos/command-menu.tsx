import { Button } from "@pp/ui/button"
import {
  CommandMenu,
  CommandMenuEmpty,
  CommandMenuInput,
  CommandMenuList,
  CommandMenuShortcut,
  type KeyLabels
} from "@pp/ui/command-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { Plus, Search, Timer, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

// ⌘K pages with nothing to list. Each frame is CommandFrame's header and
// list, and the empty is CommandFrameEmpty, 1:1.

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

type FrameEmpty = Readonly<{
  icon: LucideIcon
  title: string
  description: string
  action?: Readonly<{ label: string; icon: LucideIcon }>
}>

function CommandFrameEmpty({
  icon: Icon,
  title,
  description,
  action
}: FrameEmpty) {
  return (
    <Empty intensity="subtle" animated={false} className="m-1.5 min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action !== undefined && (
        <EmptyContent>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            leadingIcon={action.icon}
          >
            {action.label}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  )
}

// TicketContextChip: the ticket the page acts on, Backspace to leave it.
function TicketChip({ id, title }: Readonly<{ id: string; title: string }>) {
  return (
    <span className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-[7px] bg-hover pl-2 text-body">
      <span className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
          {id}
        </span>
        <span className="min-w-0 truncate font-semibold text-foreground">
          {title}
        </span>
      </span>
      <CommandMenuShortcut
        keyLabels={KEY_LABELS}
        keys="backspace"
        className="ml-0 self-stretch *:h-full *:rounded-none *:px-1.5"
      />
    </span>
  )
}

function Frame({
  placeholder,
  query,
  chip,
  empty
}: Readonly<{
  placeholder: string
  query: string
  chip?: ReactNode
  empty: FrameEmpty
}>) {
  return (
    <div className="flex max-h-[min(440px,76dvh)] w-full flex-col overflow-hidden rounded-[20px] border border-border/60 bg-popover text-foreground [corner-shape:var(--button-corner)]">
      <CommandMenu
        stretch
        items={[]}
        className="flex min-h-0 flex-1 flex-col [&_.scroll-divider]:border-t-0"
      >
        <div className="flex flex-col border-b border-border/60 has-[[data-slot=command-frame-chip]]:pt-2">
          {chip !== undefined && (
            <div data-slot="command-frame-chip" className="px-3.5">
              {chip}
            </div>
          )}
          <CommandMenuInput
            readOnly
            aria-label={placeholder}
            placeholder={placeholder}
            defaultValue={query}
          />
        </div>
        <div className="relative flex min-h-0 flex-1">
          <div className="relative z-10 flex min-h-0 min-w-0 flex-1 shrink-0 flex-col bg-popover">
            <CommandMenuList
              aria-label={placeholder}
              className="min-h-0 flex-1"
              renderItem={() => null}
            >
              <CommandMenuEmpty className="p-0">
                <CommandFrameEmpty {...empty} />
              </CommandMenuEmpty>
            </CommandMenuList>
          </div>
        </div>
      </CommandMenu>
    </div>
  )
}

function Case({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 gap-2">
      <span className="text-caption text-muted-foreground">{caption}</span>
      {children}
    </div>
  )
}

export default function CommandMenuEmpties() {
  return (
    <div className="@container grid w-full gap-8">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-8 @3xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Case caption="Any ⌘K page, query matches nothing (the default) · subtle, still">
          <Frame
            placeholder="Type a command or search…"
            query="zebra"
            empty={{
              icon: Search,
              title: "No results for “zebra”",
              description: "Try another word, or check the spelling."
            }}
          />
        </Case>
        <Case caption="Any ⌘K page with no rows and no query (the default) · subtle, still">
          <Frame
            placeholder="Switch organization…"
            query=""
            empty={{
              icon: Search,
              title: "Nothing here yet",
              description: ""
            }}
          />
        </Case>
        <Case caption="Root ⌘K in a project: turn the query into a ticket · subtle, still">
          <Frame
            placeholder="Type a command or search…"
            query="Fix login redirect"
            empty={{
              icon: Search,
              title: "No results for “Fix login redirect”",
              description: "Press Enter to turn it into a ticket.",
              action: {
                label: "Create ticket “Fix login redirect”",
                icon: Plus
              }
            }}
          />
        </Case>
        <Case caption="Ticket › Move to sprint, no open sprints · subtle, still">
          <Frame
            placeholder="Move to sprint…"
            query=""
            chip={<TicketChip id="PP-214" title="Fix login redirect" />}
            empty={{
              icon: Timer,
              title: "No open sprints",
              description: "Create one and this ticket goes straight into it.",
              action: { label: "New sprint", icon: Plus }
            }}
          />
        </Case>
      </div>
    </div>
  )
}
