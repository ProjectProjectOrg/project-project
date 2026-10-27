import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const chipVariants = cva(
  "mx-0.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 align-baseline text-xs duration-100 group-focus-within/editing:hover:bg-hover",
  {
    variants: {
      press: {
        none: "transition-colors",
        scale:
          "transition-[color,background-color,border-color,transform] active:scale-[0.97]"
      }
    },
    defaultVariants: { press: "none" }
  }
)

function Chip({
  className,
  press,
  render,
  ...props
}: ComponentProps<"span"> &
  VariantProps<typeof chipVariants> &
  Readonly<{ render?: useRender.RenderProp }>) {
  return useRender({
    defaultTagName: "span",
    render,
    props: {
      "data-slot": "chip",
      ...props,
      className: cn(chipVariants({ press }), className)
    }
  })
}

export { Chip, chipVariants }
