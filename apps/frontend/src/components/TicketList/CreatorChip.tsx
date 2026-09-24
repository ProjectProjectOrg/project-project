import type { ComponentProps, ReactNode } from "react"

import { CollapsingLabel } from "@/components/SegmentedTabs"
import { BADGE_TONES, type BadgeTone } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type CreatorChipProps = Readonly<
  Omit<ComponentProps<"button">, "children"> & {
    expanded: boolean
    tone: BadgeTone
    icon: ReactNode
    label: ReactNode
    contentKey: string
  }
>

export function CreatorChip({
  expanded,
  tone,
  icon,
  label,
  contentKey,
  className,
  ...props
}: CreatorChipProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "transition-expand inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md active:scale-[0.97]",
        expanded
          ? cn("px-2", BADGE_TONES[tone])
          : "px-1 hover:bg-accent hover:text-foreground",
        className
      )}
    >
      {icon}
      <CollapsingLabel show={expanded} contentKey={contentKey} gap={6}>
        <span className="max-w-[16ch] truncate text-xs">{label}</span>
      </CollapsingLabel>
    </button>
  )
}
