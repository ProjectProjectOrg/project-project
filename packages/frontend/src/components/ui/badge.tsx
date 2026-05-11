import * as React from "react"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

export const BADGE_TONES = {
  muted: "bg-muted text-muted-foreground hover:text-foreground",
  emerald:
    "bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300",
  red: "bg-red-500/10 text-red-700 hover:bg-red-500/15 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300",
  amber:
    "bg-amber-500/10 text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300",
  blue: "bg-blue-500/10 text-blue-700 hover:bg-blue-500/15 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300",
  violet:
    "bg-violet-500/10 text-violet-700 hover:bg-violet-500/15 hover:text-violet-800 dark:text-violet-400 dark:hover:text-violet-300",
  outline: "border border-border text-foreground hover:bg-accent"
} as const

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      tone: BADGE_TONES,
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
  render,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    render?: useRender.RenderProp
  }) {
  return useRender({
    defaultTagName: "span",
    render,
    props: {
      ...props,
      "data-tone": tone,
      className: cn(badgeVariants({ tone, size }), className)
    }
  })
}

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>
export type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>["size"]>

export { Badge, badgeVariants }
