import { useRender } from "@base-ui/react/use-render"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

const chipClass =
  "mx-0.5 inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 align-baseline text-caption transition-colors duration-100 group-focus-within/editing:hover:bg-hover"

function Chip({
  className,
  render,
  ...props
}: ComponentProps<"span"> & Readonly<{ render?: useRender.RenderProp }>) {
  return useRender({
    defaultTagName: "span",
    render,
    props: {
      "data-slot": "chip",
      ...props,
      className: cn(chipClass, className)
    }
  })
}

export { Chip }
