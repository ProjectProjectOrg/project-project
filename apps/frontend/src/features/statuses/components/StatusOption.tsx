import type { ProjectStatus } from "@pp/shared"

import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"

export function StatusOption({
  slug,
  statuses
}: Readonly<{ slug: string; statuses: ReadonlyArray<ProjectStatus> }>) {
  const meta = statusMetaFor(slug, statuses)
  const Icon = meta.icon
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Icon
        className={cn("size-4 shrink-0", meta.className)}
        style={meta.color ? { color: meta.color } : undefined}
        strokeWidth={1.75}
      />
      <span className="truncate">{meta.label}</span>
    </span>
  )
}
