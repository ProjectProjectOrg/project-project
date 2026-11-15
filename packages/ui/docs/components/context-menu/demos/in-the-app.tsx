import { Button } from "@pp/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from "@pp/ui/context-menu"
import { DropdownMenuItem, DropdownMenuShortcut } from "@pp/ui/dropdown-menu"
import {
  ArrowUpRight,
  Copy,
  GitBranch,
  ListPlus,
  Plus,
  Unlink
} from "@pp/ui/icons"
import type { KeyLabels } from "@pp/ui/kbd"
import type { ReactNode } from "react"

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

function Case({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <span className="text-caption text-muted-foreground">{caption}</span>
      {children}
    </div>
  )
}

// The three places the app opens a context menu. Right-click each.
export default function InTheApp() {
  return (
    <div className="@container grid w-full gap-8 @2xl:grid-cols-[repeat(3,minmax(0,1fr))]">
      <Case caption="Ticket › Sub-tickets: the + button (AddChildTicketButton)">
        <div className="flex items-center justify-between rounded-xl bg-card px-3 py-1.5">
          <span className="text-subtitle font-semibold">Sub-tickets</span>
          <ContextMenu>
            <ContextMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="square-7"
                  aria-label="Add sub-ticket"
                  aria-keyshortcuts="c"
                  className="motion-safe:active:scale-100"
                />
              }
            >
              <Plus className="size-4" strokeWidth={1.75} />
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <DropdownMenuItem>
                <Plus className="size-4" strokeWidth={1.75} />
                Add sub-ticket
                <DropdownMenuShortcut keys="c" keyLabels={KEY_LABELS} />
              </DropdownMenuItem>
              <DropdownMenuItem>
                <ListPlus className="size-4" strokeWidth={1.75} />
                Attach existing ticket
              </DropdownMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </div>
      </Case>

      <Case caption="Ticket › Relations: a related ticket (TicketRelationRows)">
        <ContextMenu>
          <ContextMenuTrigger className="flex h-9 items-center gap-2 rounded-lg px-2 text-body hover:bg-hover">
            <span className="font-mono text-caption text-muted-foreground tabular-nums">
              PP-212
            </span>
            <span className="truncate">Billing page shows stale plan</span>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-48">
            <DropdownMenuItem>
              <Unlink className="size-4" strokeWidth={1.75} />
              Remove blocker
            </DropdownMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Case>

      <Case caption="Sprint board card: the git chip (GitChipMenu)">
        <ContextMenu>
          <ContextMenuTrigger className="inline-flex w-fit items-center gap-1.5 rounded-full bg-hover px-2.5 py-1 font-mono text-caption text-muted-foreground">
            <GitBranch className="size-3.5" strokeWidth={1.75} />
            feat/PP-214-fix-login
          </ContextMenuTrigger>
          <ContextMenuContent className="w-56">
            <DropdownMenuItem>
              <ArrowUpRight strokeWidth={1.75} />
              Open pull request
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Copy strokeWidth={1.75} />
              Copy branch name
            </DropdownMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </Case>
    </div>
  )
}
