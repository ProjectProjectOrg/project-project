import * as React from "react"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

export const BADGE_TONES = {
  muted: "bg-muted text-muted-foreground hover:text-foreground",
  emerald: "bg-state-success/10 text-state-success hover:bg-state-success/15",
  red: "bg-state-danger/10 text-state-danger hover:bg-state-danger/15",
  amber: "bg-state-warning/10 text-state-warning hover:bg-state-warning/15",
  blue: "bg-state-info/10 text-state-info hover:bg-state-info/15",
  violet: "bg-state-merged/10 text-state-merged hover:bg-state-merged/15",
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
