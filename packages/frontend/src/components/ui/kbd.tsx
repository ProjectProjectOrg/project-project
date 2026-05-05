// Tiny keyboard-shortcut hint. Renders as `<kbd>` with mono digits and a
// faint border, intended to sit at the trailing edge of an input or button
// to advertise its global shortcut. Caller decides when to hide (typically
// while the input has focus, since the shortcut is preempted by typing).

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Kbd({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <kbd
      className={cn(
        "shrink-0 select-none rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground",
        className
      )}
    >
      {children}
    </kbd>
  )
}
