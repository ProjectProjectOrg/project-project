import {
  DropdownMenu,
  DropdownMenuConfirmItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import { MoreHorizontal, SlidersHorizontal, Trash2 } from "@pp/ui/icons"
import * as Effect from "effect/Effect"

// The sprint page's actions menu in the app (SprintDeleteMenu). "Delete
// sprint" confirms in place: the first click arms it, the second deletes,
// then the menu closes. It fails here every other time, to show the error.
let attempts = 0

export default function ConfirmItem() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
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
        <DropdownMenuConfirmItem
          icon={<Trash2 className="size-4" strokeWidth={1.75} />}
          label="Delete sprint"
          confirmLabel="Delete this sprint?"
          busyLabel="Deleting…"
          describeError={() => "Couldn't delete the sprint."}
          onConfirm={() =>
            Effect.runPromiseExit(
              Effect.sleep("1 second").pipe(
                Effect.andThen(
                  (attempts += 1) % 2 === 1
                    ? Effect.fail("offline")
                    : Effect.void
                )
              )
            )
          }
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
