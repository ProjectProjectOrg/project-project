import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function CountPill({
  active,
  className,
  children
}: Readonly<{ active: boolean; className?: string; children: ReactNode }>) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-1.5 py-1 font-mono text-micro leading-none tabular-nums [text-box:trim-both_cap_alphabetic]",
        active
          ? "bg-foreground/10 text-foreground"
          : "bg-foreground/5 text-muted-foreground",
        className
      )}
    >
      {children}
    </span>
  )
}
