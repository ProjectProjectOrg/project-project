import { Button } from "@/components/ui/button"
import { m } from "@/paraglide/messages"

export function ConfirmDeleteForm({
  title,
  description,
  error,
  waiting,
  onConfirm,
  onCancel
}: Readonly<{
  title: string
  description?: string
  error?: string
  waiting: boolean
  onConfirm: () => void
  onCancel: () => void
}>) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description !== undefined && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      {error !== undefined && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {m.common_cancel_button()}
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={waiting}
          onClick={onConfirm}
        >
          {m.common_delete_confirm_button()}
        </Button>
      </div>
    </div>
  )
}
