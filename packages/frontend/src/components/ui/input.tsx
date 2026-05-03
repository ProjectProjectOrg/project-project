import * as React from "react"

import { cn } from "@/lib/utils"

// Project chrome: `border-border bg-background` (matches InputGroup, the
// status-chip strip, and every other "control surface" in the app). Height
// is 36px (`h-9`) — same as a status-chip strip outer container — so the
// base Input drops in next to those controls without size drift.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-xl border border-border bg-background px-3 py-1.5 text-sm transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
