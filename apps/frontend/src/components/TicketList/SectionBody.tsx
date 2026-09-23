import { Activity, memo, type ReactNode } from "react"

import { cn } from "@/lib/utils"

type SectionBodyProps = Readonly<{
  collapsed: boolean
  children: ReactNode
}>

export const SectionBody = memo(
  function SectionBody({ collapsed, children }: SectionBodyProps) {
    return (
      <div
        aria-hidden={collapsed || undefined}
        inert={collapsed ? true : undefined}
        className={cn(
          "grid",
          collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <Activity mode={collapsed ? "hidden" : "visible"}>
            <div className="flex flex-col gap-1 pt-1">{children}</div>
          </Activity>
        </div>
      </div>
    )
  },
  (previous, next) => previous.collapsed && next.collapsed
)
