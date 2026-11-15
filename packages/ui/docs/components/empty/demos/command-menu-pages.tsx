import { Button } from "@pp/ui/button"
import {
  CommandMenu,
  CommandMenuEmpty,
  CommandMenuInput,
  CommandMenuItem,
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
import { cn } from "@pp/ui/lib/utils"
import {
  ExternalLink,
  EyeOff,
  Flag,
  FolderPlus,
  GitBranch,
  ListPlus,
  Pencil,
  type LucideIcon
} from "lucide-react"
import type { ReactNode } from "react"

// More ⌘K pages that start empty and ask for input, and the peek pane with
// nothing to show.

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

// CommandFrameEmpty, 1:1.
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

// SprintContextChip for a planned sprint (SprintStateIcon: Flag, muted).
function SprintChip({ name }: Readonly<{ name: string }>) {
  return (
    <span className="inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-[7px] bg-hover px-2 text-body">
      <Flag
        className="size-3 shrink-0 text-muted-foreground"
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="min-w-0 truncate font-semibold text-foreground">
        {name}
      </span>
    </span>
  )
}

const surfaceClass =
  "flex w-full flex-col overflow-hidden rounded-[20px] border border-border/60 bg-popover text-foreground [corner-shape:var(--button-corner)]"

function Frame({
  placeholder,
  query,
  description,
  chip,
  fixedHeight = false,
  empty
}: Readonly<{
  placeholder: string
  query: string
  // A read-only line in place of the query (CommandFrame's `description`).
  description?: string
  chip?: ReactNode
  fixedHeight?: boolean
  empty: FrameEmpty
}>) {
  return (
    <div className={cn(surfaceClass, "max-h-[min(440px,76dvh)]")}>
      <CommandMenu
        stretch
        items={[]}
        className={cn(
          "flex min-h-0 flex-col [&_.scroll-divider]:border-t-0",
          fixedHeight ? "h-[min(440px,76dvh)] flex-none" : "flex-1"
        )}
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
            defaultValue={description ?? query}
            className={
              description === undefined
                ? undefined
                : "cursor-default text-muted-foreground caret-transparent"
            }
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

const PEEK_ROWS = [
  { value: "PP-212", label: "Billing page shows stale plan" },
  { value: "PP-214", label: "Fix login redirect" },
  { value: "PP-219", label: "Export tickets as CSV" }
] as const

// The peek pane opened on a row it can't preview: the list narrows to 42%
// and the pane (58%) says so (CommandPeek's PeekContent fallback).
function PeekFrame() {
  return (
    <div className={cn(surfaceClass, "h-72")}>
      <CommandMenu
        stretch
        items={PEEK_ROWS}
        initialValue="PP-214"
        className="flex min-h-0 flex-1 flex-col [&_.scroll-divider]:border-t-0"
      >
        <div className="flex flex-col border-b border-border/60">
          <CommandMenuInput
            readOnly
            aria-label="Type a command or search…"
            placeholder="Type a command or search…"
            defaultValue="login"
          />
        </div>
        <div className="relative flex min-h-0 flex-1">
          <aside className="absolute inset-y-0 right-0 w-[58%] overflow-hidden">
            <Empty
              intensity="subtle"
              animated={false}
              className="h-full min-h-0"
            >
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <EyeOff strokeWidth={1.75} />
                </EmptyMedia>
                <EmptyTitle>No preview</EmptyTitle>
              </EmptyHeader>
            </Empty>
          </aside>
          <div className="relative z-10 flex min-h-0 w-[42%] min-w-0 shrink-0 flex-col border-r border-border/60 bg-popover">
            <CommandMenuList
              aria-label="Tickets"
              className="min-h-0 flex-1"
              renderItem={(item) => (
                <CommandMenuItem value={item.value}>
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
                        {item.value}
                      </span>
                      <span className="min-w-0 truncate">{item.label}</span>
                    </span>
                  </span>
                </CommandMenuItem>
              )}
            />
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

export default function CommandMenuPages() {
  return (
    <div className="@container grid w-full gap-8">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-8 @3xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Case caption="⌘K › Create project, before a name is typed · subtle, still">
          <Frame
            placeholder="Project name…"
            query=""
            empty={{
              icon: FolderPlus,
              title: "Name your project",
              description: "Type a name. The ticket key is derived from it."
            }}
          />
        </Case>
        <Case caption="Sprint › Rename, before a name is typed · subtle, still">
          <Frame
            placeholder="New sprint name…"
            query=""
            chip={<SprintChip name="Sprint 12" />}
            empty={{ icon: Pencil, title: "Type a new name", description: "" }}
          />
        </Case>
        <Case caption="Ticket › Add sub-ticket, nothing to attach (fixed height) · subtle, still">
          <Frame
            placeholder="Search tickets to add as sub-ticket…"
            query=""
            fixedHeight
            chip={<TicketChip id="PP-214" title="Fix login redirect" />}
            empty={{
              icon: ListPlus,
              title: "No tickets to attach",
              description: "Type a title to create a new one."
            }}
          />
        </Case>
        <Case caption="Connect GitHub › choose an App, none registered (admin) · subtle, still">
          <Frame
            placeholder="Choose a GitHub App"
            query=""
            description="Choose which App to install or connect to a GitHub account or organization."
            empty={{
              icon: GitBranch,
              title:
                "No GitHub App registered. Ask an organization admin to set one up.",
              description:
                "Register an App for this ProjectProject organization. This is separate from your personal GitHub connection.",
              action: { label: "Register GitHub App", icon: ExternalLink }
            }}
          />
        </Case>
        <Case caption="⌘K peek · nothing to preview · subtle, still">
          <PeekFrame />
        </Case>
      </div>
    </div>
  )
}
