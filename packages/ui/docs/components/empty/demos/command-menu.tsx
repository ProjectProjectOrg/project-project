import { Button } from "@pp/ui/button"
import {
  CommandMenu,
  CommandMenuEmpty,
  CommandMenuInput,
  CommandMenuList
} from "@pp/ui/command-menu"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import { Plus, Search, type LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

// ⌘K with nothing to list: CommandFrame's header and list, and the empty is
// CommandFrameEmpty, 1:1.

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

// Root ⌘K in a project, a query nothing matches: the empty state offers to
// turn the query into a ticket (CommandFrameEmpty).
export default function RootSearch() {
  return (
    <div className="grid w-full justify-items-center">
      <div className="w-full max-w-xl">
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
      </div>
    </div>
  )
}
