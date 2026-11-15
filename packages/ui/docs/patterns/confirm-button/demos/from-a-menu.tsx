import { ConfirmButton } from "@pp/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { MoreHorizontal, SlidersHorizontal, Trash2 } from "lucide-react"
import { useRef } from "react"

// The sprint page's actions menu in the app (SprintDeleteMenu). Picking
// "Delete sprint" closes the menu and opens the stacked confirm in a
// popover on the menu's button.
export default function FromAMenu() {
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <ConfirmButton.Root bare>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              ref={trigger}
              type="button"
              aria-label="Sprint actions"
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors transition-transform duration-100 outline-none hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]"
            >
              <MoreHorizontal className="size-4" strokeWidth={1.75} />
            </button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={6} className="w-56">
          <DropdownMenuItem>
            <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <ConfirmButton.MenuItem
            variant="destructive"
            className="cursor-pointer"
          >
            <Trash2 className="size-4" strokeWidth={1.75} />
            Delete sprint
          </ConfirmButton.MenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmButton.Popover anchor={trigger} className="w-72">
        <ConfirmButton.Action
          cancelLabel="Cancel"
          describeError={() => "Couldn't delete the sprint."}
          layout="stacked"
          prompt="Delete this sprint?"
          description="Membership is removed; tickets remain."
          label="Delete"
          onConfirm={() => undefined}
        />
      </ConfirmButton.Popover>
    </ConfirmButton.Root>
  )
}
