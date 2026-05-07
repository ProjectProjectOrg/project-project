import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmButton, useConfirmButton } from "@/components/ui/confirm-button"

export function ConfirmDeleteIcon({
  ariaLabel,
  message,
  confirmLabel = "Delete",
  onConfirm,
  disabled
}: {
  ariaLabel: string
  message: string
  confirmLabel?: string
  onConfirm: () => Promise<void> | void
  disabled?: boolean
}) {
  return (
    <ConfirmButton.Root>
      <ConfirmButton.Trigger
        variant="ghost"
        size="icon-sm"
        aria-label={ariaLabel}
        disabled={disabled}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive -my-2"
      >
        <Trash2 strokeWidth={1.75} />
      </ConfirmButton.Trigger>
      <ConfirmButton.Confirm>
        <ConfirmBody
          message={message}
          confirmLabel={confirmLabel}
          onConfirm={onConfirm}
        />
      </ConfirmButton.Confirm>
    </ConfirmButton.Root>
  )
}

function ConfirmBody({
  message,
  confirmLabel,
  onConfirm
}: {
  message: string
  confirmLabel: string
  onConfirm: () => Promise<void> | void
}) {
  const { close, busy, setBusy } = useConfirmButton()
  async function run() {
    setBusy(true)
    try {
      await onConfirm()
      close()
    } catch {
      setBusy(false)
    }
  }
  return (
    <>
      <span className="text-xs text-muted-foreground">{message}</span>
      <Button
        size="sm"
        onClick={() => void run()}
        disabled={busy}
        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
      >
        {busy ? "Deleting…" : confirmLabel}
      </Button>
      <ConfirmButton.Cancel />
    </>
  )
}
