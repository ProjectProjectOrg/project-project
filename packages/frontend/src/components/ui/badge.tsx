import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      tone: {
        // Soft tinted backgrounds with darker foreground in light mode and
        // a brighter foreground in dark mode — the project's standard
        // colored-chip treatment, lifted out of the dozen one-off spans.
        muted: "bg-muted text-muted-foreground",
        emerald:
          "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        red: "bg-red-500/10 text-red-700 dark:text-red-400",
        amber: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
        blue: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
        violet:
          "bg-violet-500/10 text-violet-700 dark:text-violet-400",
        outline: "border border-border text-foreground"
      },
      size: {
        xs: "h-5 px-1.5 text-[11px]",
        sm: "h-6 px-2 py-0.5 text-xs",
        md: "h-7 px-2.5 py-1 text-xs"
      }
    },
    defaultVariants: {
      tone: "muted",
      size: "sm"
    }
  }
)

function Badge({
  className,
  tone,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"
  return (
    <Comp
      data-slot="badge"
      data-tone={tone}
      className={cn(badgeVariants({ tone, size }), className)}
      {...props}
    />
  )
}

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>
export type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>["size"]>

export { Badge, badgeVariants }
