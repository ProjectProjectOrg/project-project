import type { ComponentProps } from "react"

import { cn } from "../lib/utils"

/*
 * ButtonGroup: buttons joined edge to edge, like a split button (an action
 * and a menu of its options).
 *
 *   <ButtonGroup>
 *     <Button variant="tertiary" size="sm">Start sprint</Button>
 *     <Button variant="tertiary" size="square-7" aria-label="Schedule">…</Button>
 *   </ButtonGroup>
 *
 * The buttons keep their own variant and size; the group squares the edges
 * where they meet and overlaps them by a pixel so a hairline isn't doubled.
 */
export function ButtonGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="button-group"
      className={cn(
        "flex items-center",
        "*:not-first:-ml-px *:not-first:rounded-l-none *:not-last:rounded-r-none",
        className
      )}
      {...props}
    />
  )
}
