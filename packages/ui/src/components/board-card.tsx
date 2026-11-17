import type { ComponentProps, ReactNode } from "react"

import { cn } from "../lib/utils"
import { itemSurfaceClass } from "./item-link"

/*
 * A ticket on a board: a raised card with its key (and parent) on top, the
 * assignee in the corner, a two-line title and a row of property chips.
 *
 *   <BoardCard
 *     link={<ItemLink render={<Link … />} aria-label="ATL-23 Fix login" />}
 *     meta={<TicketKey value="ATL-23" />}
 *     assignee={<AssigneeField … />}
 *     title="Fix login"
 *     properties={<>…chips…</>}
 *   >
 *     {sub-tickets}
 *   </BoardCard>
 *
 * The title always takes two lines of room, so every card in a column is one
 * height and the column reads as a grid. Anything after the properties (the
 * sub-ticket list) goes in `children`.
 */

type BoardCardProps = Omit<ComponentProps<"div">, "title"> &
  Readonly<{
    // An ItemLink stretched over the card, so a click anywhere opens it.
    link?: ReactNode
    // The key and, for a sub-ticket, its parent; muted caption text.
    meta?: ReactNode
    // Top right, a 24px avatar.
    assignee?: ReactNode
    title: ReactNode
    // The chip row; hidden when every chip in it renders nothing.
    properties?: ReactNode
  }>

export function BoardCard({
  link,
  meta,
  assignee,
  title,
  properties,
  className,
  children,
  ...props
}: BoardCardProps) {
  return (
    <div
      data-slot="board-card"
      {...props}
      className={cn(
        "relative isolate flex flex-col rounded-lg bg-surface-3 px-2.5 pt-2 pb-1 text-left shadow-surface-1 transition outline-none not-in-data-keyboard-navigation:hover:bg-surface-4 not-in-data-keyboard-navigation:hover:shadow-surface-1-hover in-data-keyboard-navigation:duration-0 has-[[data-item-link]:focus-visible]:bg-surface-4 has-[[data-item-link]:focus-visible]:shadow-surface-1-hover has-[[data-item-link]:focus-visible]:duration-0 has-[[data-popup-open]]:bg-surface-4 has-[[data-popup-open]]:shadow-surface-1-hover data-[popup-open]:bg-surface-4 data-[popup-open]:shadow-surface-1-hover",
        itemSurfaceClass,
        className
      )}
    >
      {link}
      <div className="flex min-w-0 flex-col gap-2.5 pb-1">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex h-6 min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
            <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
              {meta}
            </span>
            {assignee ? (
              // -mr-0.5 sets the 24px avatar 8px from the card's top and
              // right edges alike.
              <span className="-mr-0.5 ml-auto flex shrink-0 items-center">
                {assignee}
              </span>
            ) : null}
          </div>
          <div className="min-h-[2lh] min-w-0 text-subtitle leading-snug font-semibold">
            <span className="line-clamp-2">{title}</span>
          </div>
        </div>
        {properties ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1 [&:not(:has(>:not(:empty)))]:hidden [&>:empty]:hidden">
            {properties}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export type { BoardCardProps }
