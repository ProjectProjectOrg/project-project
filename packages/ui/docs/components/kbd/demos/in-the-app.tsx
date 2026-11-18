import { Button } from "@pp/ui/button"
import { GitBranch, Plus, SearchIcon } from "@pp/ui/icons"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@pp/ui/input-group"
import { Kbd, KbdShortcut, type KeyLabels } from "@pp/ui/kbd"
import { cn } from "@pp/ui/lib/utils"
import { menuItemClass, menuSurfaceClass } from "@pp/ui/menu-styles"
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

export default function InTheApp() {
  return (
    <div className="@container grid w-full gap-8 @2xl:grid-cols-[repeat(2,minmax(0,1fr))]">
      <Case caption="Backlog search: the key that focuses it">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon className="size-4" strokeWidth={1.75} />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search tickets"
            aria-label="Search tickets"
            aria-keyshortcuts="/"
          />
          <Kbd aria-hidden>/</Kbd>
        </InputGroup>
      </Case>

      <Case caption="Ticket git › Create branch (a menu row's meta)">
        <div className={cn(menuSurfaceClass, "w-64")}>
          <div
            data-highlighted=""
            className={cn(menuItemClass, "text-foreground")}
          >
            <Plus />
            <span className="flex-1">Create branch</span>
            <KbdShortcut
              aria-hidden
              size="sm"
              keys="shift+↵"
              keyLabels={KEY_LABELS}
            />
          </div>
          <div className={menuItemClass}>
            <GitBranch />
            <span className="flex-1">feat/PP-214-fix-login</span>
          </div>
        </div>
      </Case>

      <Case caption="Sprint › add an epic's tickets (picker footer)">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[18px] border border-border/60 bg-card p-2 [corner-shape:var(--button-corner)]">
          <span className="flex items-center gap-1 text-micro text-muted-foreground">
            <KbdShortcut size="sm" keys="↑↓" keyLabels={KEY_LABELS} />
            <Kbd size="sm">Space</Kbd>
            <span className="ml-0.5">to toggle</span>
          </span>
          <div className="flex items-center gap-1.5">
            <Button type="button" size="xs" variant="ghost">
              Cancel
              <Kbd size="sm">Esc</Kbd>
            </Button>
            <Button type="button" size="xs" variant="primary">
              Add 3 tickets
              <KbdShortcut size="sm" keys="↵" keyLabels={KEY_LABELS} />
            </Button>
          </div>
        </div>
      </Case>

      <Case caption="Ticket description: edit and done">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            aria-keyshortcuts="E"
            className="rounded-full bg-page pl-3"
          >
            Edit
            <Kbd aria-hidden>E</Kbd>
          </Button>
          <Button aria-keyshortcuts="Escape" className="rounded-full">
            Done
            <Kbd aria-hidden>Esc</Kbd>
          </Button>
        </div>
      </Case>
    </div>
  )
}
