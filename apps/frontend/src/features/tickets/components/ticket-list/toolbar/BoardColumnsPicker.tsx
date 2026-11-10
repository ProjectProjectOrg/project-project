import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"

import { CheckboxGroup, CheckboxItem } from "@/components/ui/checkbox-group"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  useBoardColumns,
  type BoardScope
} from "@/features/sprints/hooks/useBoardColumns"
import { canHide } from "@/features/sprints/lib/boardColumns"
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
  return (
    <div className="-mx-3 space-y-1 border-b border-border/60 px-3 pb-3">
      <div className="text-[13px] text-muted-foreground">
        {m.tickets_view_options_columns()}
      </div>
      <CheckboxGroup
        checkedIndices={checkedIndices}
        aria-label={m.tickets_view_options_columns()}
        className="-mx-2"
      >
        {order.map((status, index) => {
          const meta = statusMetaFor(status, statuses)
          const Icon = meta.icon
          return (
            <CheckboxItem
              key={status}
              index={index}
              label={meta.label}
              checked={checkedIndices.has(index)}
              disabled={!canHide(order, layout.hidden, status)}
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
    </div>
  )
}
