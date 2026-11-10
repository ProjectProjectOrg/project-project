import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"
import { ChevronDown } from "lucide-react"

import { CheckboxGroup, CheckboxItem } from "@/components/ui/checkbox-group"
import { menuPopupClass } from "@/components/ui/menu-styles"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
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
  const checkedIndices = new Set(
    order.flatMap((status, index) =>
      layout.hidden.includes(status) ? [] : [index]
    )
  )
  const label = m.tickets_view_options_columns()
  const displayValue =
    checkedIndices.size === order.length
      ? m.tickets_view_options_columns_all()
      : m.tickets_view_options_columns_count({
          visible: checkedIndices.size,
          total: order.length
        })
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <Popover>
        <PopoverTrigger
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
        </PopoverTrigger>
        <PopoverContent align="end" className={cn(menuPopupClass, "w-56")}>
          <CheckboxGroup checkedIndices={checkedIndices} aria-label={label}>
            {order.map((status, index) => {
              const meta = statusMetaFor(status, statuses)
              const Icon = meta.icon
              return (
                <CheckboxItem
                  key={status}
                  index={index}
                  label={meta.label}
                  checked={checkedIndices.has(index)}
                  onToggle={() => layout.toggleHidden(status)}
                  icon={
                    <Icon
                      className={cn("size-4 shrink-0", meta.className)}
                      style={meta.color ? { color: meta.color } : undefined}
                      strokeWidth={1.75}
                    />
                  }
                  meta={
                    counts ? (
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {counts[status] ?? 0}
                      </span>
                    ) : null
                  }
                />
              )
            })}
          </CheckboxGroup>
        </PopoverContent>
      </Popover>
    </div>
  )
}
