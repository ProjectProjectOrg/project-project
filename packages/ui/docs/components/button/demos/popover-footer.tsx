import { Button } from "@pp/ui/button"

// The stacked confirm in a popover (Confirm button, from a menu): ghost
// Cancel, then the destructive action on the end.
export default function PopoverFooter() {
  return (
    <div className="w-72 rounded-xl border border-border/60 surface-card p-3">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <p className="text-subtitle font-semibold">Delete this sprint?</p>
          <p className="text-caption text-muted-foreground">
            Membership is removed; tickets remain.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
          <Button variant="destructive" size="sm">
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
