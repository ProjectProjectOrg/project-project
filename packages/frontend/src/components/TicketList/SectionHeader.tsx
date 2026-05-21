import type { ReactNode } from "react"
import { statusLabelFor, statusMetaFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { ProjectStatus, TicketStatus } from "@projectproject/shared"

export function SectionHeader({
  status,
  statuses,
  count
}: {
  status: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
  count: number
}): ReactNode {
  const meta = statusMetaFor(status, statuses)
  const Icon = meta.icon
  const label = statusLabelFor(status, statuses)

  return (
    <div className="flex w-full items-center gap-2">
      <Icon
        className={cn("size-4 shrink-0", meta.className)}
        style={meta.color ? { color: meta.color } : undefined}
        strokeWidth={1.75}
      />
      <span className="truncate text-sm font-medium">{label}</span>
      <span
        className="rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground"
        aria-label={m.tickets_section_count_aria_label({ count })}
      >
        {count}
      </span>
    </div>
  )
}
