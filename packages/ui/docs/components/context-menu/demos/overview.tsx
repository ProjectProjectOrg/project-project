import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger
} from "@pp/ui/context-menu"
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut
} from "@pp/ui/dropdown-menu"
import type { KeyLabels } from "@pp/ui/kbd"
import { cn } from "@pp/ui/lib/utils"
import {
  menuItemClass,
  menuSeparatorClass,
  menuSurfaceClass
} from "@pp/ui/menu-styles"
import { Copy, Link, ListPlus, Plus, Unlink } from "lucide-react"

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

// Left: right-click (or long-press) the card for the live menu. Right: the
// same menu, drawn open, with its first row highlighted. The rows are the
// dropdown menu's own; only the way it opens differs.
export default function Overview() {
  return (
    <div className="@container grid w-full items-start gap-8 @xl:grid-cols-[repeat(2,minmax(0,1fr))]">
      <ContextMenu>
        <ContextMenuTrigger className="grid h-40 place-items-center rounded-[20px] border border-dashed border-border text-body text-muted-foreground [corner-shape:var(--button-corner)]">
          Right-click here
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <DropdownMenuItem>
            <Plus strokeWidth={1.75} />
            Add sub-ticket
            <DropdownMenuShortcut keys="c" keyLabels={KEY_LABELS} />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <ListPlus strokeWidth={1.75} />
            Attach existing ticket
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Copy strokeWidth={1.75} />
            Copy branch name
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive">
            <Unlink strokeWidth={1.75} />
            Unlink
          </DropdownMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <div
        className={cn(menuSurfaceClass, "relative w-56 justify-self-center")}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-1 top-1 block h-[34px] translate-y-px rounded-md bg-hover"
        />
        <div data-highlighted="" className={cn(menuItemClass, "relative")}>
          <Plus strokeWidth={1.75} />
          Add sub-ticket
          <DropdownMenuShortcut keys="c" keyLabels={KEY_LABELS} />
        </div>
        <div className={menuItemClass}>
          <ListPlus strokeWidth={1.75} />
          Attach existing ticket
        </div>
        <div className={menuSeparatorClass} />
        <div className={menuItemClass}>
          <Link strokeWidth={1.75} />
          Copy PR link
        </div>
        <div
          data-variant="destructive"
          className={cn(menuItemClass, "text-destructive")}
        >
          <Unlink strokeWidth={1.75} />
          Unlink
        </div>
      </div>
    </div>
  )
}
