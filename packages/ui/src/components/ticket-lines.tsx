import { useRender } from "@base-ui/react/use-render"
import {
  useState,
  type ComponentProps,
  type FocusEvent,
  type ReactNode
} from "react"

import { cn } from "../lib/utils"
import { MenuHighlight } from "./menu-highlight"
import {
  menuChoiceItemClass,
  menuItemClass,
  menuLabelClass
} from "./menu-styles"

/*
 * A short list of tickets as menu rows: a card's sub-tickets, and the
 * popovers that preview sub-tickets or linked tickets.
 *
 *   <TicketLines>
 *     <TicketLinesLabel>Blocked by</TicketLinesLabel>
 *     <TicketLine
 *       status={<TicketStatusIcon … />}
 *       ticketKey="ATL-12"
 *       title="Lazy-load the settings module"
 *       render={<Link to="…" />}
 *     />
 *   </TicketLines>
 *
 * Every line is a dropdown menu row, literally: `menuItemClass` and the
 * menu's gliding `MenuHighlight`, so the rows, the highlight, its spring and
 * the hover and press fills are the menu's own. The columns (status, key,
 * title) are a grid, so keys of different lengths still start the titles on
 * one line.
 */

// A line is a menu row: it marks itself highlighted while the pointer is on
// it or it has keyboard focus, as Base UI does for menu items, so the menu's
// row styles and MenuHighlight apply as-is.
export function useRowHighlight() {
  const [highlighted, setHighlighted] = useState(false)
  return {
    "data-highlighted": highlighted ? "" : undefined,
    onPointerEnter: () => setHighlighted(true),
    onPointerLeave: () => setHighlighted(false),
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (event.target.matches(":focus-visible")) setHighlighted(true)
    },
    onBlur: () => setHighlighted(false)
  }
}

export function TicketLines({
  className,
  children,
  ...props
}: ComponentProps<"ul">) {
  return (
    <ul
      data-slot="ticket-lines"
      className={cn(
        "relative grid grid-cols-[auto_auto_minmax(0,1fr)]",
        className
      )}
      {...props}
    >
      <MenuHighlight />
      {children}
    </ul>
  )
}

// A heading over a group of lines ("Blocked by", "3/5 sub-tickets done").
export function TicketLinesLabel({
  className,
  ...props
}: ComponentProps<"li">) {
  return (
    <li className={cn(menuLabelClass, "col-span-full", className)} {...props} />
  )
}

type TicketLineProps = Omit<useRender.ComponentProps<"a">, "title"> &
  Readonly<{
    status: ReactNode
    ticketKey: string
    // The widest key in the list (in ch), so titles start on one line.
    keyWidth?: string
    title: string
    // The ticket on screen: shown as picked, and not a link.
    current?: boolean
  }>

// One ticket: status, key, and its title as the link (the router's link
// through `render`), stretched over the row.
export function TicketLine({
  status,
  ticketKey,
  keyWidth,
  title,
  current = false,
  render,
  className,
  ...props
}: TicketLineProps) {
  const highlight = useRowHighlight()
  const link = useRender({
    defaultTagName: "a",
    render,
    props: {
      ...props,
      "data-item-link": "",
      draggable: false,
      title,
      children: title,
      className: cn(
        "min-w-0 truncate outline-none after:absolute after:inset-0 after:content-['']",
        className
      )
    }
  })
  return (
    <li
      {...highlight}
      // The current ticket is picked, not hovered.
      data-highlighted={current ? undefined : highlight["data-highlighted"]}
      data-selected={current || undefined}
      aria-current={current ? "page" : undefined}
      className={cn(
        menuItemClass,
        menuChoiceItemClass,
        "z-20 col-span-full grid grid-cols-subgrid"
      )}
    >
      {/* 24px, like the priority chip on a card: status icons share its
          centre, so a card's icons stand in one column. */}
      <span className="grid w-6 place-items-center">{status}</span>
      <span
        style={keyWidth ? { minWidth: keyWidth } : undefined}
        className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums"
      >
        {ticketKey}
      </span>
      {current ? <span className="min-w-0 truncate">{title}</span> : link}
    </li>
  )
}

export type { TicketLineProps }
