import type { BlockIconName } from "@pp/shared"

import { blockIconComponent } from "@/lib/block-icons"
import { cn } from "@/lib/utils"

export function BlockIconGlyph({
  icon,
  color,
  className
}: Readonly<{
  icon: BlockIconName
  color?: string | null
  className?: string
}>) {
  const Icon = blockIconComponent(icon)
  return (
    <Icon
      aria-hidden
      data-block-icon={icon}
      strokeWidth={1.75}
      className={cn("size-4 shrink-0", className)}
      style={color === null || color === undefined ? undefined : { color }}
    />
  )
}
