import { FoldHorizontal, GripVertical } from "lucide-react"
import { motion } from "motion/react"

import { Button } from "@/components/ui/button"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import {
  BOARD_COLUMN_HEADER_CLASS,
  BoardColumnCount,
  BoardColumnTitle
} from "./BoardColumnShell"
import type { useLongPress } from "./BoardReorderMode"

export const QUICK_S = 0.2
export const REORDER_EASE = [0.32, 0.72, 0, 1] as const

type StatusMeta = ReturnType<typeof statusMetaFor>

export function ColumnHeader({
  meta,
  count,
  reorderMode,
  holdable,
  onPointerDown,
  holdHandlers,
  onCollapse
}: Readonly<{
  meta: StatusMeta
  count: number
  reorderMode: boolean
  holdable: boolean
  onPointerDown: (e: React.PointerEvent) => void
  holdHandlers: HoldHandlers
  onCollapse?: () => void
}>) {
  return (
    <div
      data-column-header
      onPointerDown={onPointerDown}
      {...holdHandlers}
      className={cn(
        BOARD_COLUMN_HEADER_CLASS,
        "group/reveal",
        (holdable || reorderMode) &&
          "cursor-grab touch-none active:cursor-grabbing"
      )}
    >
      <BoardColumnTitle meta={meta} />
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {onCollapse && !reorderMode && (
          <CollapseColumnButton label={meta.label} onCollapse={onCollapse} />
        )}
        <span className="grid shrink-0 place-items-center">
          <motion.span
            initial={false}
            animate={{ opacity: reorderMode ? 1 : 0 }}
            transition={{ duration: QUICK_S, ease: REORDER_EASE }}
            className="col-start-1 row-start-1 text-muted-foreground"
            aria-hidden
          >
            <GripVertical className="size-4" strokeWidth={1.75} />
          </motion.span>
          <motion.span
            initial={false}
            animate={{ opacity: reorderMode ? 0 : 1 }}
            transition={{ duration: QUICK_S, ease: REORDER_EASE }}
            className="col-start-1 row-start-1"
            aria-hidden={reorderMode}
          >
            <BoardColumnCount value={count} />
          </motion.span>
        </span>
      </span>
    </div>
  )
}

export type HoldHandlers = Partial<
  Omit<ReturnType<typeof useLongPress>["handlers"], "onPointerDown">
>

export function CollapsedColumnHeader({
  meta,
  count,
  highlighted,
  reorderMode,
  onPointerDown,
  holdHandlers,
  onExpand
}: Readonly<{
  meta: StatusMeta
  count: number
  highlighted: boolean
  reorderMode: boolean
  onPointerDown: (e: React.PointerEvent) => void
  holdHandlers: HoldHandlers
  onExpand?: () => void
}>) {
  const Icon = meta.icon
  const label = m.sprints_board_column_expand({ status: meta.label })
  return (
    <button
      type="button"
      data-column-header
      onPointerDown={onPointerDown}
      {...holdHandlers}
      onClick={() => {
        if (!reorderMode) onExpand?.()
      }}
      aria-label={label}
      title={label}
      className={cn(
        "flex w-full flex-col items-center gap-[13px] rounded-xl px-2 py-3 text-body font-semibold transition-colors duration-150 outline-none select-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
        highlighted && "bg-accent/40",
        reorderMode && "cursor-grab touch-none active:cursor-grabbing"
      )}
    >
      <span className="grid size-6 shrink-0 place-items-center">
        <Icon
          className={cn("size-4", meta.className)}
          style={meta.color ? { color: meta.color } : undefined}
          strokeWidth={1.75}
        />
      </span>
      <span className="[writing-mode:vertical-rl]">{meta.label}</span>
      <BoardColumnCount value={count} />
    </button>
  )
}

function CollapseColumnButton({
  label,
  onCollapse
}: Readonly<{ label: string; onCollapse: () => void }>) {
  const text = m.sprints_board_column_collapse({ status: label })
  return (
    <Button
      type="button"
      variant="quiet"
      size="square-7"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onCollapse}
      aria-label={text}
      title={text}
      className="opacity-0 group-hover/reveal:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
    >
      <FoldHorizontal className="size-4" strokeWidth={1.75} />
    </Button>
  )
}
