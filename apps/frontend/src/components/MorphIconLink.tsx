import type { LucideIcon } from "lucide-react"
import { motion } from "motion/react"
import type { ComponentProps } from "react"

import { transitions } from "@/lib/springs"

type Props = Omit<
  ComponentProps<typeof motion.a>,
  "children" | "className" | "layout" | "transition"
> &
  Readonly<{ layoutId: string; label: string; icon: LucideIcon }>

export function MorphIconLink({ label, icon: Icon, ...props }: Props) {
  return (
    <motion.a
      {...props}
      layout="position"
      transition={transitions.morph}
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.stopPropagation()}
      className="shrink-0 rounded text-muted-foreground transition-colors duration-100 hover:text-foreground [&>svg]:transition-transform [&>svg]:duration-100 active:[&>svg]:scale-[0.97]"
    >
      <Icon strokeWidth={1.75} className="size-3" aria-hidden="true" />
    </motion.a>
  )
}
