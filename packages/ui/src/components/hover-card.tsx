import type { ComponentProps } from "react"

import { cn } from "../lib/utils"

/*
 * A hover card: opens when the pointer rests on its trigger (a link or a
 * button) or the trigger gets keyboard focus, and unlike a tooltip it can be
 * moved into and clicked, so it can hold lists of ticket links.
 *
 *   <HoverCard>
 *     <HoverCardTrigger render={<button …/>} openOnClick>2/5</HoverCardTrigger>
 *     <HoverCardContent className="w-72 p-1">…</HoverCardContent>
 *   </HoverCard>
 *
 * A card that reads like a record (a pull request, a tag) pads 12px and
 * takes a title and a footer:
 *
 *   <HoverCardContent className="flex w-80 flex-col gap-2 p-3">
 *     <HoverCardTitle>Fix flaky CSV export test</HoverCardTitle>
 *     <HoverCardFooter>Checks failing</HoverCardFooter>
 *   </HoverCardContent>
 *
 * It's drawn by the tooltip host (tooltip.tsx), so there's one hover on
 * screen at a time, the same delay and warm-up, and moving between a
 * tooltip and a card glides and resizes instead of closing and opening.
 * What it keeps from Base UI's Preview Card, which it replaced: open on
 * hover after a delay and on keyboard focus, stay open while the pointer is
 * on it, Escape and a click outside close it, `openOnClick` opens it from
 * the keyboard and touch, and the popup has no tooltip role, so it doesn't
 * describe its trigger.
 *
 * It wears the tooltip's skin at a card's corners (hoverCardSurfaceClass).
 */
export {
  closeHoverCard,
  HoverCard,
  HoverCardContent,
  hoverCardSurfaceClass,
  HoverCardTrigger
} from "./tooltip"

// A card's title: two lines at most, in the body size.
export function HoverCardTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="hover-card-title"
      className={cn(
        "line-clamp-2 text-body leading-snug font-semibold",
        className
      )}
      {...props}
    />
  )
}

// The card's last row, under a hairline and out to its edges: the outcome
// or the action below what the card shows. It bleeds out of a card padded
// 12px (`p-3`).
export function HoverCardFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="hover-card-footer"
      className={cn(
        "-mx-3 -mb-3 flex min-w-0 items-center gap-1.5 border-t border-border/60 px-3 py-2 text-caption text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}
