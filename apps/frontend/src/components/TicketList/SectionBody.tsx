import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type SectionBodyProps = Readonly<{
  collapsed: boolean
  children: ReactNode
}>

export function SectionBody({ collapsed, children }: SectionBodyProps) {
  return (
    <div
      aria-hidden={collapsed || undefined}
      inert={collapsed ? true : undefined}
      className={cn("grid", collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]")}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="flex flex-col gap-1 pt-1">{children}</div>
      </div>
    </div>
  )
}
