import { Button } from "@pp/ui/button"

export default function ConfirmDialog() {
  return (
    <div className="w-80 rounded-[20px] bg-surface-1 p-1 corner-squircle">
      <div className="flex flex-col gap-4 rounded-2xl bg-card p-4 corner-squircle">
        <div className="flex flex-col gap-1">
          <p className="text-body font-semibold">Delete sprint?</p>
          <p className="text-body text-muted-foreground">
            Its 12 tickets move back to the backlog.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm">
            Cancel
          </Button>
          <Button variant="destructive" size="sm">
            Delete sprint
          </Button>
        </div>
      </div>
    </div>
  )
}
