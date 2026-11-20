import { useRender } from "@base-ui/react/use-render"
import { cn } from "@pp/ui/lib/utils"
import type { ComponentProps } from "react"

// A project link in the About aside: label over URL in a card that lights up
// with its row (`group/reveal`), which also holds the copy and edit buttons.
export function LinkCard({
  render,
  className,
  ...props
}: ComponentProps<"a"> & Readonly<{ render?: useRender.RenderProp }>) {
  return useRender({
    defaultTagName: "a",
    render,
    props: {
      ...props,
      className: cn(
        "focus-ring flex w-full min-w-0 cursor-pointer flex-col rounded-lg px-1.5 pt-0.5 pb-1.5 text-caption text-muted-foreground transition-colors outline-none group-hover/reveal:bg-hover group-hover/reveal:text-foreground",
        className
      )
    }
  })
}
