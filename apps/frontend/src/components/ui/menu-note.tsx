import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export function MenuNote({
  tone = "muted",
  children
}: Readonly<{ tone?: "muted" | "error"; children: ReactNode }>) {
  return (
    <p
      role={tone === "error" ? "alert" : undefined}
      className={cn(
        "px-2 py-1.5 text-[13px] leading-5",
        tone === "error" ? "text-destructive" : "text-muted-foreground"
      )}
    >
      {children}
    </p>
  )
}
