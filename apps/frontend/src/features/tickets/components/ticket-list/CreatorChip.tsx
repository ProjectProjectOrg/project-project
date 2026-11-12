import type { ComponentProps, ReactNode } from "react"

import { BADGE_TONES, type BadgeTone } from "@/components/ui/badge"
import { CollapsingLabel } from "@/components/ui/collapsing-label"
import { cn } from "@/lib/utils"

export type CreatorChipProps = Readonly<
  Omit<ComponentProps<"button">, "children"> & {
    expanded: boolean
    tone: BadgeTone
    tint?: string | null
    icon: ReactNode
    label: ReactNode
    contentKey: string
    labelClassName?: string
  }
>

export function CreatorChip({
  expanded,
  tone,
  tint = null,
  icon,
  label,
  contentKey,
  labelClassName = "max-w-[16ch]",
  className,
  style,
  ...props
}: CreatorChipProps) {
  const tinted = expanded && tint !== null
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "transition-expand inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md outline-none focus-visible:ring-1 focus-visible:ring-ring active:scale-[0.97]",
        expanded
          ? cn("px-2", !tinted && BADGE_TONES[tone])
          : "px-1 hover:bg-hover hover:text-foreground",
        className
      )}
      style={
        tinted ? { ...style, backgroundColor: `${tint}1a`, color: tint } : style
      }
    >
      {icon}
      <CollapsingLabel show={expanded} contentKey={contentKey} gap={6}>
        <span className={cn("truncate text-caption", labelClassName)}>
          {label}
        </span>
      </CollapsingLabel>
    </button>
  )
}
