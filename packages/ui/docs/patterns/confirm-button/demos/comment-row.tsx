import { Avatar, AvatarFallback } from "@pp/ui/avatar"
import { Button } from "@pp/ui/button"
import { ConfirmButton } from "@pp/ui/confirm-button"
import * as Effect from "effect/Effect"

// CommentRow in the app: the header's Edit and the trash icon. Deleting
// slides the confirm over the header; the author and time stay put.
export default function CommentRow() {
  return (
    <div className="w-full max-w-lg rounded-xl border border-border/60 surface-background corner-squircle">
      <header className="flex min-h-7 items-center justify-between gap-2 pt-2 pr-1.5 pl-3 text-body">
        <div className="flex min-h-7 items-center gap-2">
          <Avatar className="size-5">
            <AvatarFallback>AL</AvatarFallback>
          </Avatar>
          <span className="font-semibold">Ada Lovelace</span>
          <span className="text-caption text-muted-foreground">2h ago</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost">
            Edit
          </Button>
          <ConfirmButton.Root>
            <ConfirmButton.DeleteTrigger aria-label="Delete comment" />
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                cancelLabel="Cancel"
                describeError={() => "Couldn't delete the comment."}
                prompt="Delete this comment?"
                label="Delete"
                busyLabel="Deleting…"
                onConfirm={() =>
                  Effect.runPromiseExit(
                    Effect.sleep("1200 millis").pipe(
                      Effect.andThen(Effect.fail("offline"))
                    )
                  )
                }
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </div>
      </header>
      <p className="px-3 pt-1 pb-3 text-body">
        The importer drops archived tickets; can we keep them behind a flag?
      </p>
    </div>
  )
}
