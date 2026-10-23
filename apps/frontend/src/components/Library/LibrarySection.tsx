import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

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
      <div className="min-w-0 px-0.5">
        <h2 id={id} className="text-[13px] font-medium">
          {title}
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  )
}

export const LIBRARY_GRID_CLASS =
  "grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2"
