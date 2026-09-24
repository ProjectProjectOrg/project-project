import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/**
 * The heading every section on the library page shares: a label and a
 * one-line description in the general settings style, with an optional
 * action (New template, New block) on the right.
 */
export function LibrarySectionHeader({
  id,
  title,
  description,
  action,
  className
}: Readonly<{
  id: string
  title: string
  description: string
  action?: ReactNode
  className?: string
}>) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3",
        className
      )}
    >
      <div className="min-w-0">
        <h2 id={id} className="text-sm font-medium">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

export const LIBRARY_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2"
