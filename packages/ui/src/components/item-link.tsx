import { useRender } from "@base-ui/react/use-render"

import { cn } from "../lib/utils"

/*
 * The whole-item link of a ticket row or board card: an empty link stretched
 * over the item, so a click anywhere opens it, with the item's own controls
 * (status, assignee, chips) lifted above it so they still take their clicks.
 *
 *   <div className={cn(itemSurfaceClass, "relative")}>
 *     <ItemLink render={<Link to="…" />} aria-label="ATL-23 Fix login" />
 *     …controls…
 *   </div>
 *
 * The item needs `position: relative` (or `isolate`) for the link to fill
 * it. Pass the router's link through `render`; the link has no content of its
 * own, so give it an `aria-label`.
 */

// Lifts the item's links and buttons over the stretched link.
export const itemSurfaceClass =
  "[&_a:not([data-item-link])]:relative [&_a:not([data-item-link])]:z-20 [&_button]:relative [&_button]:z-20"

// Above the item's background, under its controls (`z-20`).
export const itemLayerClass = "relative z-20"

type ItemLinkProps = useRender.ComponentProps<"a">

export function ItemLink({ render, className, ...props }: ItemLinkProps) {
  return useRender({
    defaultTagName: "a",
    render,
    props: {
      ...props,
      "data-item-link": "",
      draggable: false,
      className: cn(
        "absolute inset-0 z-10 rounded-[inherit] outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        className
      )
    }
  })
}
