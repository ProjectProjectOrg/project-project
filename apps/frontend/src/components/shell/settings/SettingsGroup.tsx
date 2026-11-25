import { useRender } from "@base-ui/react/use-render"
import { cn } from "@pp/ui/lib/utils"
import type { ComponentProps } from "react"

export function SettingsGroup({
  className,
  render,
  ...props
}: ComponentProps<"div"> & { render?: useRender.RenderProp }) {
  const group = useRender({
    defaultTagName: "div",
    render,
    props: {
      ...props,
      className: cn(
        "tertiary-tiles divide-y divide-border overflow-hidden rounded-lg border border-border surface-card",
        className
      )
    }
  })
  return group
}
