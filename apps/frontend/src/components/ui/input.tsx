import * as React from "react"

import { cn } from "@/lib/utils"

type InputVariant = "default" | "inline" | "inline-muted"

const INPUT_VARIANT: Record<InputVariant, string> = {
  default:
    "h-9 rounded-xl border border-border bg-background px-3 py-1.5 transition-[color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  inline:
    "rounded-md bg-transparent px-2 py-1 font-medium transition-colors placeholder:font-normal hover:bg-foreground/5 focus-visible:bg-background focus-visible:ring-1 focus-visible:ring-ring aria-invalid:ring-1 aria-invalid:ring-destructive",
  "inline-muted":
    "rounded-md bg-transparent px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-foreground/5 focus-visible:bg-background focus-visible:text-foreground focus-visible:ring-1 focus-visible:ring-ring aria-invalid:ring-1 aria-invalid:ring-destructive"
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
        "w-full min-w-0 text-sm ring-offset-background outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        INPUT_VARIANT[variant],
        className
      )}
      {...props}
    />
  )
}

export { Input }
