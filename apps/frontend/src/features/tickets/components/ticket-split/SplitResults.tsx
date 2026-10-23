import { Plus, X } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export type RailShape = "node" | "stem" | "stem-end"

const ROW_PADDING_Y = "0.625rem"
const HEADER_GAP = "0.75rem"

function Rail({ shape, connectUp }: { shape: RailShape; connectUp: boolean }) {
  const overshoot = connectUp ? HEADER_GAP : "0px"
  const rowCenter = `calc(50% + ${overshoot} / 2)`
  return (
    <span
      aria-hidden
      className="relative col-start-1 flex w-6 shrink-0 justify-center self-stretch"
      style={{
        marginTop: `calc((${ROW_PADDING_Y} + ${overshoot}) * -1)`,
        marginBottom: `calc(${ROW_PADDING_Y} * -1)`
      }}
    >
      <span
        className="w-px bg-border"
        style={{ height: shape === "stem-end" ? rowCenter : "100%" }}
      />
      {shape === "node" ? (
        <span
          className="absolute size-[7px] -translate-y-1/2 rounded-full bg-foreground"
          style={{ top: rowCenter }}
        />
      ) : (
        <span
          className="absolute left-1/2 h-px w-1/2 -translate-y-1/2 bg-border"
          style={{ top: rowCenter }}
        />
      )}
    </span>
  )
}

export function SplitResults({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_auto_auto_auto_minmax(0,1fr)_auto_auto_auto]">
      {children}
    </div>
  )
}

function Row({
  shape,
  connectUp = false,
  ticketId,
  status,
  priority,
  title,
  sprint,
  assignees,
  type,
  onRemove,
  removeLabel
}: {
  shape: RailShape
  connectUp?: boolean
  ticketId: string
  status: ReactNode
  priority: ReactNode
  title: ReactNode
  sprint: ReactNode
  assignees: ReactNode
  type: ReactNode
  onRemove?: (() => void) | undefined
  removeLabel: string
}) {
  return (
    <div className="col-span-full grid grid-cols-subgrid">
      <div className="col-span-full grid grid-cols-subgrid items-center gap-3 py-2.5 pr-3">
        <Rail shape={shape} connectUp={connectUp} />
        {status}
        {priority}
        <span className="inline-flex shrink-0 items-center font-mono text-xs text-muted-foreground tabular-nums">
          {ticketId}
        </span>
        <div className="flex min-w-0 items-center">{title}</div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          {sprint}
          {assignees}
        </div>
        {type}
        <span className="inline-flex w-8 shrink-0 items-center justify-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={removeLabel}
            onClick={onRemove}
            disabled={onRemove === undefined}
            aria-hidden={onRemove === undefined}
            tabIndex={onRemove === undefined ? -1 : undefined}
            className={cn(onRemove === undefined && "invisible")}
          >
            <X strokeWidth={1.75} />
          </Button>
        </span>
      </div>
    </div>
  )
}

function Add({ onClick, hint }: { onClick: () => void; hint: string }) {
  return (
    <div className="col-span-full flex items-center gap-3 pt-2 pl-6">
      <Button
        type="button"
        variant="tertiary"
        size="md"
        leadingIcon={Plus}
        onClick={onClick}
      >
        {m.tickets_split_add_result()}
      </Button>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  )
}

SplitResults.Row = Row
SplitResults.Add = Add
