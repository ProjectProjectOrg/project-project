import NumberFlow from "@number-flow/react"
import type { ReactNode } from "react"

import type { StatusMeta } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"

export const BOARD_COLUMN_CLASS =
  "flex max-h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-1"

export const BOARD_COLUMN_HEADER_CLASS =
  "relative flex items-center justify-between px-3.5 pt-3 pb-2 select-none"

export const BOARD_CARD_LIST_CLASS =
  "relative z-10 min-h-0 flex-1 overflow-y-auto pb-2"

export const BOARD_CARD_SLOT_CLASS = "relative px-3 py-1"

type BoardColumnTitleProps = Readonly<{
  meta: Pick<StatusMeta, "icon" | "label" | "className" | "color">
}>

export function BoardColumnTitle({ meta }: BoardColumnTitleProps) {
  const Icon = meta.icon
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
      <span className="grid size-6 shrink-0 place-items-center">
        <Icon
          className={cn("size-4", meta.className)}
          style={meta.color ? { color: meta.color } : undefined}
          strokeWidth={1.75}
        />
      </span>
      {meta.label}
    </span>
  )
}

export function BoardColumnCount({ value }: Readonly<{ value: number }>) {
  return (
    <NumberFlow
      value={value}
      transformTiming={{ duration: 180, easing: "ease-out" }}
      spinTiming={{ duration: 180, easing: "ease-out" }}
      opacityTiming={{ duration: 180, easing: "ease-out" }}
      className="font-mono text-xs text-muted-foreground tabular-nums"
    />
  )
}

type BoardColumnShellProps = Readonly<{
  meta: BoardColumnTitleProps["meta"]
  count: number
  children: ReactNode
}>

export function BoardColumnShell({
  meta,
  count,
  children
}: BoardColumnShellProps) {
  return (
    <section className={BOARD_COLUMN_CLASS}>
      <div className={BOARD_COLUMN_HEADER_CLASS}>
        <BoardColumnTitle meta={meta} />
        <BoardColumnCount value={count} />
      </div>
      <div className={BOARD_CARD_LIST_CLASS}>{children}</div>
    </section>
  )
}
