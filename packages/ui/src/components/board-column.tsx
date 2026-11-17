import NumberFlow from "@number-flow/react"
import { motion } from "motion/react"
import { useState, type ComponentProps, type ReactNode } from "react"

import { cn } from "../lib/utils"
import { Button } from "./button"
import { FoldHorizontal, GripVertical } from "./icons"
import { ScrollArea, type ScrollAreaProps } from "./scroll-area"

/*
 * A board column: a status's tickets, top to bottom, as cards.
 *
 *   <BoardColumn
 *     title={<BoardColumnTitle icon={<StatusGlyph … />} label="In progress" />}
 *     count={4}
 *     scrollLabel="Scrollable"
 *   >
 *     <div className={boardCardSlotClass}><BoardCard … /></div>
 *   </BoardColumn>
 *
 * The app's sprint board builds its own column from the parts (it animates
 * width, reorders and takes drops): `boardColumnClass`, `BoardColumnHeader`,
 * `BoardCollapsedColumnHeader` and `BoardCardList`.
 */

export const boardColumnClass =
  "flex max-h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface-1"

export const boardCollapsedColumnClass =
  "flex max-h-full w-10 shrink-0 flex-col self-start overflow-hidden rounded-xl border border-border bg-surface-1"

export const boardColumnHeaderClass =
  "relative flex items-center justify-between px-3.5 pt-3 pb-2 select-none"

// Each card's wrapper in the list: the column's side padding and half the gap
// between cards above and below, so drop targets meet without a dead strip.
export const boardCardSlotClass = "relative px-3 py-1"

// The grip and count crossfade when the board enters reorder mode.
export const boardReorderFade = {
  duration: 0.2,
  ease: [0.32, 0.72, 0, 1]
} as const

export function BoardColumnTitle({
  icon,
  label
}: Readonly<{ icon: ReactNode; label: string }>) {
  return (
    <span className="inline-flex items-center gap-1.5 text-body font-semibold">
      <span className="grid size-6 shrink-0 place-items-center">{icon}</span>
      {label}
    </span>
  )
}

// The number of cards. A change of one (a card moved in or out) rolls; a
// bigger jump (a filter) swaps at once.
export function BoardColumnCount({ value }: Readonly<{ value: number }>) {
  const [previous, setPrevious] = useState(value)
  const [animated, setAnimated] = useState(false)
  if (value !== previous) {
    setPrevious(value)
    setAnimated(Math.abs(value - previous) === 1)
  }
  return (
    <NumberFlow
      value={value}
      animated={animated}
      transformTiming={{ duration: 180, easing: "ease-out" }}
      spinTiming={{ duration: 180, easing: "ease-out" }}
      opacityTiming={{ duration: 180, easing: "ease-out" }}
      className="font-mono text-caption text-muted-foreground tabular-nums"
    />
  )
}

// The column's scrolling card list, with a short fade at its edges.
export function BoardCardList({
  scrollLabel,
  viewportProps,
  children
}: Readonly<{
  // The scroll area's role description, for example "Scrollable".
  scrollLabel: string
  viewportProps?: ScrollAreaProps["viewportProps"]
  children: ReactNode
}>) {
  return (
    <ScrollArea
      roleDescription={scrollLabel}
      className="relative z-10 flex min-h-0 flex-1 flex-col [&>[data-slot=scroll-area-scrollbar]]:pb-2"
      viewportClassName="min-h-0 flex-1 pb-2 outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset [&>div[style]]:!block [&>div[style]]:!min-w-0 ![--scroll-fade-size:6px] scroll-fade"
      viewportProps={viewportProps}
    >
      {children}
    </ScrollArea>
  )
}

type BoardColumnHeaderProps = Omit<ComponentProps<"div">, "title"> &
  Readonly<{
    title: ReactNode
    count: number
    // Reordering columns: the count gives way to a grip, and the header
    // takes the drag.
    reorderMode?: boolean
    // The header can be held to start reordering.
    holdable?: boolean
    // Folds the column to a narrow strip; leave out where columns can't fold.
    onCollapse?: () => void
    collapseLabel?: string
  }>

export function BoardColumnHeader({
  title,
  count,
  reorderMode = false,
  holdable = false,
  onCollapse,
  collapseLabel,
  className,
  ...props
}: BoardColumnHeaderProps) {
  return (
    <div
      data-column-header
      {...props}
      className={cn(
        boardColumnHeaderClass,
        "group/reveal",
        (holdable || reorderMode) &&
          "cursor-grab touch-none active:cursor-grabbing",
        className
      )}
    >
      {title}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {onCollapse && collapseLabel && !reorderMode ? (
          <Button
            type="button"
            variant="ghost"
            size="square-7"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onCollapse}
            aria-label={collapseLabel}
            title={collapseLabel}
            className="opacity-0 group-hover/reveal:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          >
            <FoldHorizontal className="size-4" strokeWidth={1.75} />
          </Button>
        ) : null}
        <span className="grid shrink-0 place-items-center">
          <motion.span
            initial={false}
            animate={{ opacity: reorderMode ? 1 : 0 }}
            transition={boardReorderFade}
            className="col-start-1 row-start-1 text-muted-foreground"
            aria-hidden
          >
            <GripVertical className="size-4" strokeWidth={1.75} />
          </motion.span>
          <motion.span
            initial={false}
            animate={{ opacity: reorderMode ? 0 : 1 }}
            transition={boardReorderFade}
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

type BoardCollapsedColumnHeaderProps = ComponentProps<"button"> &
  Readonly<{
    icon: ReactNode
    label: string
    count: number
    // The button's name, for example "Expand In progress".
    expandLabel: string
    // A card is dragged over the folded column.
    highlighted?: boolean
    reorderMode?: boolean
    onExpand?: () => void
  }>

// A folded column: icon, the status's name running down, and the count. A
// click unfolds it.
export function BoardCollapsedColumnHeader({
  icon,
  label,
  count,
  expandLabel,
  highlighted = false,
  reorderMode = false,
  onExpand,
  className,
  ...props
}: BoardCollapsedColumnHeaderProps) {
  return (
    <button
      type="button"
      data-column-header
      {...props}
      onClick={() => {
        if (!reorderMode) onExpand?.()
      }}
      // The strip shows the count, so its name carries it too.
      aria-label={`${expandLabel} ${count}`}
      title={expandLabel}
      className={cn(
        "flex w-full flex-col items-center gap-[13px] rounded-xl px-2 py-3 text-body font-semibold transition-colors duration-150 outline-none select-none hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
        highlighted && "bg-accent/40",
        reorderMode && "cursor-grab touch-none active:cursor-grabbing",
        className
      )}
    >
      <span className="grid size-6 shrink-0 place-items-center">{icon}</span>
      <span className="[writing-mode:vertical-rl]">{label}</span>{" "}
      <BoardColumnCount value={count} />
    </button>
  )
}

// A plain column: header and scrolling cards, for boards that don't reorder
// or fold (the dashboard).
export function BoardColumn({
  title,
  count,
  scrollLabel,
  className,
  children
}: Readonly<{
  title: ReactNode
  count: number
  scrollLabel: string
  className?: string
  children: ReactNode
}>) {
  return (
    <section
      data-slot="board-column"
      className={cn(boardColumnClass, className)}
    >
      <div className={boardColumnHeaderClass}>
        {title}
        <BoardColumnCount value={count} />
      </div>
      <BoardCardList scrollLabel={scrollLabel}>{children}</BoardCardList>
    </section>
  )
}
