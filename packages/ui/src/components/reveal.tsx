import type { ReactNode } from "react"

import { cn } from "../lib/utils"

/*
 * Reveal: a row's secondary controls (a menu, a delete, a select box),
 * hidden until the row is in play.
 *
 *   <li className="group/reveal">
 *     …
 *     <Reveal>
 *       <Button variant="ghost" size="icon-xs" … />
 *     </Reveal>
 *   </li>
 *
 * The row is the nearest `group/reveal`. Its children show while the row is
 * hovered (or holds the list's hover highlight), while anything in the row
 * has keyboard focus or an open popup, while the row is selected, and while
 * a child is checked or just copied. Touch screens have no hover, so there
 * they always show. During keyboard navigation the pointer's hover is
 * ignored and the change is instant.
 */
const revealClass = cn(
  "inline-flex shrink-0 opacity-0 transition-opacity in-data-keyboard-navigation:duration-0 motion-safe:duration-(--highlight-glide)",
  "not-in-data-keyboard-navigation:row-hover:opacity-100",
  "in-data-[row-selected]:opacity-100",
  "group-has-[:focus-visible]/reveal:opacity-100 focus-within:opacity-100",
  "group-has-[[data-popup-open]]/reveal:opacity-100 group-data-[popup-open]/reveal:opacity-100",
  "has-[[data-checked]]:opacity-100 has-[[data-copied]]:opacity-100",
  "pointer-coarse:opacity-100"
)

export function Reveal({
  children,
  className
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <span data-slot="reveal" className={cn(revealClass, className)}>
      {children}
    </span>
  )
}
