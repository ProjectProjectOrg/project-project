import type { ComponentProps, ReactNode } from "react"

import { BADGE_TONES, type BadgeTone } from "@/components/ui/badge"
import { CollapsingLabel } from "@/components/ui/segmented-tabs"
import { cn } from "@/lib/utils"

export type CreatorChipProps = Readonly<
  Omit<ComponentProps<"button">, "children"> & {
    expanded: boolean
    tone: BadgeTone
    icon: ReactNode
    label: ReactNode
    contentKey: string
    labelClassName?: string
  }
>

export function CreatorChip({
  expanded,
  tone,
  icon,
  label,
  contentKey,
  labelClassName = "max-w-[16ch]",
  className,
  ...props
}: CreatorChipProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "transition-expand inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.97]",
        expanded
          ? cn("px-2", BADGE_TONES[tone])
          : "px-1 hover:bg-hover hover:text-foreground",
        className
      )}
    >
      {icon}
      <CollapsingLabel show={expanded} contentKey={contentKey} gap={6}>
        <span className={cn("truncate text-xs", labelClassName)}>{label}</span>
      </CollapsingLabel>
    </button>
  )
}
