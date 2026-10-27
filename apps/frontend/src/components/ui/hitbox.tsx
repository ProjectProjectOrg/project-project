import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

type Margin = "1" | "2" | "3" | "4"
type Mode = "inline" | "absolute"

const MARGIN: Record<Margin, string> = {
  "1": "before:-inset-1",
  "2": "before:-inset-2",
  "3": "before:-inset-3",
  "4": "before:-inset-4"
}

type HitboxProps = ComponentProps<"button"> &
  Readonly<{
    mode?: Mode
    margin?: Margin
  }>

export function Hitbox({
  mode = "inline",
  margin = "2",
  className,
  children,
  ...rest
}: HitboxProps) {
  return (
    <button
      type="button"
      className={cn(
        "group/hitbox cursor-pointer outline-none before:absolute before:content-[''] focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default",
        "rounded-[20px]",
        mode === "absolute"
          ? "absolute inset-0"
          : "relative inline-flex items-center",
        MARGIN[margin],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
