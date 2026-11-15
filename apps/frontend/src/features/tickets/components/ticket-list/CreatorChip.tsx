import { badgeVariants, type BadgeTone } from "@pp/ui/badge"
import { CollapsingLabel } from "@pp/ui/collapsing-label"
import { cn } from "@pp/ui/lib/utils"
import { TextSwap } from "@pp/ui/text-swap"
import type { ComponentProps, ReactNode } from "react"

export type CreatorChipProps = Readonly<
  Omit<ComponentProps<"button">, "children"> & {
    expanded: boolean
    tone: BadgeTone
    icon: ReactNode
    label: string
    labelClassName?: string
  }
>

export function CreatorChip({
  expanded,
  tone,
  icon,
  label,
  labelClassName = "max-w-[16ch]",
  className,
  ...props
}: CreatorChipProps) {
  return (
    <button
      type="button"
      {...props}
      data-tone={expanded ? tone : undefined}
      className={cn(
        expanded
          ? cn(badgeVariants({ tone }), "px-2")
          : "px-1 hover:bg-hover hover:text-foreground",
        "transition-expand focus-ring inline-flex h-6 shrink-0 items-center gap-1.5 rounded-[12px] [corner-shape:var(--button-corner)] active:scale-[0.97]",
        className
      )}
    >
      {icon}
      <CollapsingLabel show={expanded} gap={6}>
        <TextSwap className={cn("text-caption", labelClassName)}>
          {label}
        </TextSwap>
      </CollapsingLabel>
    </button>
  )
}
