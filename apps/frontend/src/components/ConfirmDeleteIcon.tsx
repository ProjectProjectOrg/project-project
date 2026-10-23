import { Trash2 } from "lucide-react"

import { ConfirmButton } from "@/components/ui/confirm-button"
import { m } from "@/paraglide/messages"

export function ConfirmDeleteIcon({
  ariaLabel,
  message,
  onConfirm,
  disabled,
  dense = false
}: {
  ariaLabel: string
  message: string
  onConfirm: () => Promise<void> | void
  disabled?: boolean
  /** Pull the icon up/down with -my-2 so it nests cleanly into a row of larger controls (e.g. an input). */
  dense?: boolean
}) {
  return (
    <ConfirmButton.Root>
      <ConfirmButton.Trigger
        variant="ghost"
        size="icon-sm"
        aria-label={ariaLabel}
        disabled={disabled}
        className={
          "text-muted-foreground hover:bg-destructive/10 hover:text-destructive" +
          (dense ? " -my-2" : "")
        }
      >
        <Trash2 strokeWidth={1.75} />
      </ConfirmButton.Trigger>
      <ConfirmButton.Confirm>
        <ConfirmButton.Action
          prompt={message}
          label={m.common_delete_confirm_button()}
          busyLabel={m.common_deleting_button()}
          onConfirm={onConfirm}
        />
      </ConfirmButton.Confirm>
    </ConfirmButton.Root>
  )
}
