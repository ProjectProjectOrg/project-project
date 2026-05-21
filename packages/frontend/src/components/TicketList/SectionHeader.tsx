import { ChevronDown, Plus } from "lucide-react"
import type { ReactNode } from "react"
import { Hitbox } from "@/components/ui/hitbox"
import { statusLabelFor, statusMetaFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { ProjectStatus, TicketStatus } from "@projectproject/shared"

export function SectionHeader({
  status,
  statuses,
  count,
  collapsed,
  onToggleCollapsed,
  onStartCreate
}: {
  status: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
  count: number
  collapsed: boolean
  onToggleCollapsed: () => void
  onStartCreate: () => void
}): ReactNode {
  const meta = statusMetaFor(status, statuses)
  const Icon = meta.icon
  const label = statusLabelFor(status, statuses)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggleCollapsed}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggleCollapsed()
        }
      }}
      aria-expanded={!collapsed}
      aria-label={m.tickets_section_collapse_aria_label({ label })}
      className={cn(
        "sticky top-0 z-10 flex cursor-pointer items-center gap-2 rounded-t-xl border-b border-border bg-background/95 px-3 py-2 backdrop-blur",
        "transition-colors hover:bg-accent/30 active:scale-[0.997]",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <ChevronDown
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform duration-150",
          collapsed && "-rotate-90"
        )}
        strokeWidth={1.75}
      />
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
      <span className="ml-auto inline-flex items-center">
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => {
            e.stopPropagation()
            onStartCreate()
          }}
          aria-label={m.tickets_section_create_aria_label({ label })}
          title={m.tickets_section_create_aria_label({ label })}
        >
          <span className="grid size-6 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]">
            <Plus className="size-4" strokeWidth={1.75} />
          </span>
        </Hitbox>
      </span>
    </div>
  )
}
