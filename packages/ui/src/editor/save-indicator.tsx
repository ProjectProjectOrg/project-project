import { cn } from "../lib/utils"
import { m } from "./messages"
import type { SaveStatus } from "./save-queue"

export function MarkdownSaveIndicator({
  status,
  className
}: {
  status: SaveStatus
  className?: string
}) {
  const label =
    status === "dirty" || status === "saving"
      ? m.tickets_save_status_dirty()
      : status === "saved"
        ? m.tickets_save_status_saved()
        : status === "failed"
          ? m.editor_save_failed()
          : null

  if (!label) return null

  return (
    <span
      className={cn(
        "text-caption",
        status === "failed" ? "text-destructive" : "text-muted-foreground",
        className
      )}
    >
      {label}
    </span>
  )
}
