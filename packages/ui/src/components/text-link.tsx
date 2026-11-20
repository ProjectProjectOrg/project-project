import { useRender } from "@base-ui/react/use-render"
import type { ComponentProps } from "react"

import { cn } from "../lib/utils"

/*
 * TextLink: a link that reads as text in a line, like a sub-ticket's parent
 * before its title. Muted at rest, foreground and underlined on hover, with
 * the house focus ring. Its padding is cancelled by equal negative margins,
 * so the click area reaches past the text and nothing around it moves.
 *
 *   <TextLink render={<Link to="…" />}>{parent.title}</TextLink>
 */
export function TextLink({
  render,
  className,
  ...props
}: ComponentProps<"a"> & Readonly<{ render?: useRender.RenderProp }>) {
  return useRender({
    defaultTagName: "a",
    render,
    props: {
      "data-slot": "text-link",
      ...props,
      className: cn(
        "focus-ring -mx-1.5 -my-1 rounded-md px-1.5 py-1 text-muted-foreground underline-offset-4 transition-colors outline-none hover:text-foreground hover:underline",
        className
      )
    }
  })
}
