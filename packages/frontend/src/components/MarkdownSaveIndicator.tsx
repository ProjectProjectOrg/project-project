import type { SaveStatus } from "@/components/LexicalEditor"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

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
        : null

  if (!label) return null

  return (
    <span className={cn("text-xs text-muted-foreground", className)}>
      {label}
    </span>
  )
}
