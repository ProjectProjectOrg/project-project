import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronDown } from "lucide-react"

import { CheckboxMenuItem } from "@/components/ui/checkbox-menu-item"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { menuItemMetaClass } from "@/components/ui/menu-styles"
import { triggerVariants } from "@/components/ui/select"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  useBoardColumns,
  type BoardScope
} from "@/features/sprints/hooks/useBoardColumns"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useTicketToolbar } from "./context"

export function BoardColumnsPicker({ scope }: Readonly<{ scope: BoardScope }>) {
  const { counts } = useTicketToolbar()
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const statuses = Result.isSuccess(result) ? result.value : []
  const order = boardStatusesFor(statuses)
  const layout = useBoardColumns(scope)
  if (order.length === 0) return null
  const visible = order.filter((status) => !layout.hidden.includes(status))
  const label = m.tickets_view_options_columns()
  const displayValue =
    visible.length === order.length
      ? m.tickets_view_options_columns_all()
      : m.tickets_view_options_columns_count({
          visible: visible.length,
          total: order.length
        })
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-body text-muted-foreground">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={m.tickets_view_options_picker_aria_label({
            label,
            value: displayValue
          })}
          className={cn(
            triggerVariants(),
            "ml-auto h-8 w-40 min-w-0 rounded-[20px]"
          )}
        >
          <span className="min-w-0 flex-1 truncate text-left">
            {displayValue}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-colors duration-80 group-hover:text-foreground"
            strokeWidth={2}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56" highlightFirst>
          {order.map((status) => {
            const meta = statusMetaFor(status, statuses)
            const Icon = meta.icon
            return (
              <CheckboxMenuItem
                key={status}
                label={meta.label}
                checked={visible.includes(status)}
                onToggle={() => layout.toggleHidden(status)}
              >
                <Icon
                  className={cn("size-4", meta.className)}
                  style={meta.color ? { color: meta.color } : undefined}
                  strokeWidth={1.75}
                />
                <span className="min-w-0 truncate">{meta.label}</span>
                {counts && (
                  <span data-menu-meta className={menuItemMetaClass}>
                    {counts[status] ?? 0}
                  </span>
                )}
              </CheckboxMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
