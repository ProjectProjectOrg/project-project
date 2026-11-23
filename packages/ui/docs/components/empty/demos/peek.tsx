import {
  CommandMenu,
  CommandMenuInput,
  CommandMenuItem,
  CommandMenuList
} from "@pp/ui/command-menu"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@pp/ui/empty"
import { EyeOff } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { popupSurfaceClass } from "@pp/ui/menu-styles"

// The ⌘K peek pane with nothing to show.

const surfaceClass = `${popupSurfaceClass} flex w-full flex-col overflow-hidden`

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
          <div className="relative z-10 flex min-h-0 w-[42%] min-w-0 shrink-0 flex-col border-r border-(--segment-line) surface-(--tooltip)">
            <CommandMenuList
              aria-label="Tickets"
              renderItem={(item) => (
                <CommandMenuItem value={item.value}>
                  <span className="flex min-w-0 flex-1 items-center gap-1">
                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span className="shrink-0 text-caption text-muted-foreground tabular-nums">
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

// The ⌘K peek pane, next to a row with nothing to preview (CommandPeek).
export default function Peek() {
  return (
    <div className="grid w-full justify-items-center">
      <div className="w-full max-w-3xl">
        <PeekFrame />
      </div>
    </div>
  )
}
