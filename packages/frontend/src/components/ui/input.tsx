import * as React from "react"

import { cn } from "@/lib/utils"

// Project chrome: `border-border bg-background` (matches InputGroup, the
// status-chip strip, and every other "control surface" in the app). Height
// is 36px (`h-9`) — same as a status-chip strip outer container — so the
// base Input drops in next to those controls without size drift.
type InputVariant = "default" | "inline"

const INPUT_VARIANT: Record<InputVariant, string> = {
  default:
    "h-9 rounded-xl border border-border bg-background px-3 py-1.5 transition-[color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  inline:
    "rounded-md bg-transparent px-2 py-1 font-medium transition-colors placeholder:font-normal hover:bg-foreground/5 focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring aria-invalid:ring-1 aria-invalid:ring-destructive"
}

function Input({
  className,
  type,
  variant = "default",
  ...props
}: React.ComponentProps<"input"> & { variant?: InputVariant }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 text-sm outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        INPUT_VARIANT[variant],
        className
      )}
      {...props}
    />
  )
}

export { Input }
