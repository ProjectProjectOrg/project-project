import type { ComponentProps, ReactNode } from "react"

import { cn } from "../lib/utils"
import { itemLayerClass, itemSurfaceClass } from "./item-link"

/*
 * A ticket in a list: one row of the list's grid, with a slot per column so
 * every row lines up. Each row is a subgrid of `listGridClassName`, which the
 * list sets on the element holding the rows.
 *
 *   <div className={listGridClassName}>
 *     <ListRow
 *       link={<ItemLink render={<Link … />} aria-label="ATL-23 Fix login" />}
 *       lead={<Checkbox … />}
 *       status={<StatusButton … />}
 *       priority={<PriorityButton … />}
 *       ticketKey={<TicketKey value="ATL-23" />}
 *       title={<ListRowTitle>Fix login</ListRowTitle>}
 *       trailing={<>…chips…</>}
 *       estimate={…}
 *       assignee={…}
 *     />
 *   </div>
 *
 * Columns, left to right: lead (the selection checkbox, revealed on hover),
 * status, priority, key, title (takes the rest), trailing (chips), estimate
 * and assignee. The CSS variables `--list-lead`, `--list-lead-gap`,
 * `--list-icon` and `--list-row-gap` (theme.css) size the leading columns, so
 * section headers can line up with them; `--ticket-key-width` (set by the
 * list) keeps keys of different lengths one width.
 */

export const listGridClassName =
  "grid gap-y-1 grid-cols-[auto_auto_auto_auto_minmax(0,1fr)_auto_auto_auto]"

type ListRowProps = Omit<ComponentProps<"div">, "title"> &
  Readonly<{
    // An ItemLink stretched over the row, so a click anywhere opens it.
    link?: ReactNode
    lead?: ReactNode
    status?: ReactNode
    priority?: ReactNode
    ticketKey?: ReactNode
    title: ReactNode
    trailing?: ReactNode
    estimate?: ReactNode
    assignee?: ReactNode
    // Picked in a multi-select: a tinted fill instead of the hover.
    selected?: boolean
    // "embedded" drops the row's own hover and corners, for a row inside
    // another surface that already has them (the dashboard's cards).
    variant?: "standalone" | "embedded"
    // Disables the row's controls (status, priority, estimate, assignee), for
    // someone who can only look.
    disabled?: boolean
  }>

export function ListRow({
  link,
  lead,
  status,
  priority,
  ticketKey,
  title,
  trailing,
  estimate,
  assignee,
  selected = false,
  variant = "standalone",
  disabled = false,
  className,
  ...props
}: ListRowProps) {
  return (
    <div
      data-slot="list-row"
      data-selected={selected || undefined}
      {...props}
      className={cn(
        "group/reveal relative col-span-full grid grid-cols-subgrid items-center gap-x-(--list-row-gap) px-3 py-2.5 text-left outline-none",
        itemSurfaceClass,
        variant === "standalone" &&
          "isolate rounded-lg transition-colors not-in-data-keyboard-navigation:hover:bg-hover in-data-keyboard-navigation:duration-0 has-[[data-item-link]:focus-visible]:duration-0 not-data-selected:has-[[data-item-link]:focus-visible]:bg-hover not-data-selected:has-[[data-popup-open]]:bg-hover data-selected:bg-foreground/6 not-data-selected:data-[popup-open]:bg-hover",
        // The link reaches into the gap between rows, so the rows have no
        // dead strip between them.
        "[&>[data-item-link]]:before:absolute [&>[data-item-link]]:before:inset-x-0 [&>[data-item-link]]:before:-inset-y-0.5 [&>[data-item-link]]:before:content-['']",
        className
      )}
    >
      {link}
      <span
        className={cn(
          itemLayerClass,
          "box-content flex w-(--list-lead) justify-center pr-[calc(var(--list-lead-gap)-var(--list-row-gap))]"
        )}
      >
        {lead}
      </span>
      <fieldset disabled={disabled} className="contents">
        <span
          className={cn(itemLayerClass, "flex w-(--list-icon) justify-center")}
        >
          {status}
        </span>
        <span className={cn(itemLayerClass, "inline-flex")}>{priority}</span>
        <span className="shrink-0 text-body">{ticketKey}</span>
      </fieldset>
      <div className="col-start-5 row-start-1 flex min-w-0 items-center self-stretch pl-1">
        {title}
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1 [&>fieldset>span:empty]:hidden">
        {trailing}
      </div>
      <fieldset disabled={disabled} className="contents">
        <div className="flex justify-end">{estimate}</div>
        <div className="hidden justify-end sm:flex">{assignee}</div>
      </fieldset>
    </div>
  )
}

// The title text: one line, truncated, in the row's weight.
export function ListRowTitle({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("min-w-0 truncate text-body font-semibold", className)}
      {...props}
    />
  )
}

export type { ListRowProps }
