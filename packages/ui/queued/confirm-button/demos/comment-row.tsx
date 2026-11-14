import { Button } from "@pp/ui/button"
import { ConfirmButton } from "@pp/ui/confirm-button"
import { Pencil } from "lucide-react"

export default function CommentRow() {
  return (
    <div className="w-full max-w-lg rounded-xl bg-surface-1 corner-squircle">
      <div className="flex h-11 items-center gap-2 pr-1.5 pl-3">
        <span className="text-body font-semibold">Ada Lovelace</span>
        <span className="text-caption text-muted-foreground">2h ago</span>
        <div className="ml-auto flex items-center">
          <Button variant="ghost" size="icon-sm" aria-label="Edit comment">
            <Pencil strokeWidth={1.75} />
          </Button>
          <ConfirmButton.Root>
            <ConfirmButton.DeleteTrigger aria-label="Delete comment" />
            <ConfirmButton.Confirm>
              <ConfirmButton.Action
                prompt="Delete this comment?"
                label="Delete"
                busyLabel="Deleting…"
                cancelLabel="Cancel"
                describeError={() => "Couldn't delete the comment."}
                onConfirm={() => undefined}
              />
            </ConfirmButton.Confirm>
          </ConfirmButton.Root>
        </div>
      </div>
      <p className="px-3 pb-3 text-body">
        The importer drops archived tickets; can we keep them behind a flag?
      </p>
    </div>
  )
}
