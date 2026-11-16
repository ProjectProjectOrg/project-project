import { motion } from "motion/react"
import type { ComponentProps } from "react"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import type { IconType } from "./icons"

// An icon action inside a chip (download, open, remove): a 24px round target
// (the minimum) around a 12px icon, tinting on hover. It overhangs a 20px
// chip by 2px top and bottom, so the chip keeps the text's line height.
export const chipIconActionClass =
  "focus-ring relative -my-0.5 grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-[color,background-color] duration-150 ease-standard hover:bg-hover hover:text-foreground hover:duration-0 [&>svg]:transition-transform [&>svg]:duration-100 active:[&>svg]:scale-[0.85]"

type Props = Omit<
  ComponentProps<typeof motion.a>,
  "children" | "className" | "layout" | "transition"
> &
  Readonly<{
    layoutId: string
    label: string
    icon: IconType
    className?: string
  }>

export function MorphIconLink({
  label,
  icon: Icon,
  className,
  ...props
}: Props) {
  return (
    <motion.a
      {...props}
      layout="position"
      transition={transitions.morph}
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.stopPropagation()}
      className={cn(chipIconActionClass, className)}
    >
      <Icon strokeWidth={1.75} className="size-3" aria-hidden="true" />
    </motion.a>
  )
}
