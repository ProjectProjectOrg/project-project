import NumberFlow from "@number-flow/react"
import {
  useState,
  type ComponentProps,
  type CSSProperties,
  type PointerEvent,
  type ReactNode
} from "react"

import { cn } from "../lib/utils"
import { Button } from "./button"
import { FoldHorizontal, GripVertical } from "./icons"
import { ScrollArea, type ScrollAreaProps } from "./scroll-area"

/*
 * A board column: a status's tickets, top to bottom, as cards, in a well
 * washed with the status's colour from the top.
 *
 *   <BoardColumn
 *     title={<BoardColumnTitle icon={<StatusGlyph … />} label="In progress" />}
 *     tone="var(--state-info)"
 *     count={4}
 *     scrollLabel="Scrollable"
 *   >
 *     <div className={boardCardSlotClass}><BoardCard … /></div>
 *   </BoardColumn>
 *
 * The app's sprint board builds its own column from the parts (it animates
 * width, reorders and takes drops): `boardColumnClass` with
 * `boardColumnTone(tone)`, `BoardColumnHeader`, `BoardCollapsedColumnHeader`
 * and `BoardCardList`.
 */

// The well: no border, the page sunk a step, and 22px squircle corners, the
// cards' 14px plus the 8px they sit in from its edge. data-over rings it
// while a card is dragged over.
export const boardColumnClass =
  "board-column-wash flex max-h-full w-72 shrink-0 flex-col overflow-hidden rounded-[22px] bg-surface-1 [corner-shape:var(--button-corner)]"

export const boardCollapsedColumnClass =
  "board-column-wash flex max-h-full w-10 shrink-0 flex-col self-start overflow-hidden rounded-[20px] bg-surface-1 [corner-shape:var(--button-corner)]"

// The status's colour for the wash, the count and the drop ring; any CSS
// colour (a token or a picked #rrggbb). Without one the column is grey.
export const boardColumnTone = (
  tone: string | null | undefined
): CSSProperties & Record<"--column-tone", string> => ({
  "--column-tone": tone ?? "var(--muted-foreground)"
})

export const boardColumnHeaderClass =
  "relative flex h-11 shrink-0 items-center gap-1.5 pr-2 pl-2.5 select-none"

// Each card's wrapper in the list: 8px in from the well's sides and half the
// gap between cards above and below, so drop targets meet without a dead
// strip.
export const boardCardSlotClass = "relative px-2 py-1"

export function BoardColumnTitle({
  icon,
  label
}: Readonly<{ icon: ReactNode; label: string }>) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-body font-semibold">
      <span className="grid size-6 shrink-0 place-items-center">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  )
}

// The number of cards, in a chip tinted with the column's tone. A change of
// one (a card moved in or out) rolls; a bigger jump (a filter) swaps at once.
export function BoardColumnCount({ value }: Readonly<{ value: number }>) {
  const [previous, setPrevious] = useState(value)
  const [animated, setAnimated] = useState(false)
  if (value !== previous) {
    setPrevious(value)
    setAnimated(Math.abs(value - previous) === 1)
  }
  return (
    <span className="board-column-count inline-grid h-[18px] shrink-0 place-items-center rounded-[9px] px-1.5 [corner-shape:var(--button-corner)]">
      <NumberFlow
        value={value}
        animated={animated}
        transformTiming={{ duration: 180, easing: "ease-out" }}
        spinTiming={{ duration: 180, easing: "ease-out" }}
        opacityTiming={{ duration: 180, easing: "ease-out" }}
        className="text-caption leading-none tabular-nums"
      />
    </span>
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
    // Folds the column to a narrow strip; leave out where columns can't fold.
    onCollapse?: () => void
    collapseLabel?: string
    // The grip at the header's end, for people who may reorder the board's
    // columns: pressing it starts the column's drag. Leave out otherwise.
    onReorderStart?: (event: PointerEvent<HTMLButtonElement>) => void
    // The grip's arrow keys move the column one place left or right.
    onReorderKey?: (delta: -1 | 1) => void
    reorderLabel?: string
  }>

export function BoardColumnHeader({
  title,
  count,
  onCollapse,
  collapseLabel,
  onReorderStart,
  onReorderKey,
  reorderLabel,
  className,
  ...props
}: BoardColumnHeaderProps) {
  return (
    <div
      data-column-header
      {...props}
      className={cn(boardColumnHeaderClass, "group/reveal", className)}
    >
      {title}
      <BoardColumnCount value={count} />
      <span className="ml-auto flex shrink-0 items-center">
        {onCollapse && collapseLabel ? (
          <Button
            type="button"
            variant="ghost"
            size="square-7"
            onClick={onCollapse}
            aria-label={collapseLabel}
            title={collapseLabel}
            className="text-muted-foreground opacity-0 group-hover/reveal:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
          >
            <FoldHorizontal className="size-4" strokeWidth={1.75} />
          </Button>
        ) : null}
        {onReorderStart && reorderLabel ? (
          <Button
            type="button"
            variant="ghost"
            size="square-7"
            onPointerDown={(event) => {
              if (event.button !== 0) return
              onReorderStart(event)
            }}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return
              event.preventDefault()
              onReorderKey?.(event.key === "ArrowLeft" ? -1 : 1)
            }}
            aria-label={reorderLabel}
            title={reorderLabel}
            className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          >
            <GripVertical className="size-4" strokeWidth={1.75} />
          </Button>
        ) : null}
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
    onExpand?: () => void
  }>

// A folded column: icon, the status's name running down, and the count. A
// click unfolds it. Its well (boardCollapsedColumnClass) takes the tone and
// the drop ring.
export function BoardCollapsedColumnHeader({
  icon,
  label,
  count,
  expandLabel,
  onExpand,
  className,
  ...props
}: BoardCollapsedColumnHeaderProps) {
  return (
    <button
      type="button"
      data-column-header
      {...props}
      onClick={onExpand}
      // The strip shows the count, so its name carries it too.
      aria-label={`${expandLabel} ${count}`}
      title={expandLabel}
      className={cn(
        "focus-ring flex w-full cursor-pointer flex-col items-center gap-3 rounded-[20px] pt-2.5 pb-3.5 text-body font-semibold transition-colors duration-150 outline-none select-none [corner-shape:var(--button-corner)] hover:bg-foreground/4 hover:duration-0",
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
  tone,
  count,
  scrollLabel,
  className,
  children
}: Readonly<{
  title: ReactNode
  // The status's colour; see boardColumnTone.
  tone?: string | null
  count: number
  scrollLabel: string
  className?: string
  children: ReactNode
}>) {
  return (
    <section
      data-slot="board-column"
      className={cn(boardColumnClass, className)}
      style={boardColumnTone(tone)}
    >
      <div className={boardColumnHeaderClass}>
        {title}
        <BoardColumnCount value={count} />
      </div>
      <BoardCardList scrollLabel={scrollLabel}>{children}</BoardCardList>
    </section>
  )
}
