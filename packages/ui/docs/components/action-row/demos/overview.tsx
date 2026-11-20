import { ActionRow } from "@pp/ui/action-row"
import { Button } from "@pp/ui/button"
import { X } from "@pp/ui/icons"

export default function Overview() {
  return (
    <ActionRow
      action={
        <Button
          variant="ghost"
          size="square-7"
          aria-label="Remove"
          className="size-6"
        >
          <X className="size-3.5" strokeWidth={1.75} />
        </Button>
      }
    >
      <Button variant="ghost" tone="strong" render={<a href="#ticket" />}>
        Check ticket editing
      </Button>
    </ActionRow>
  )
}
