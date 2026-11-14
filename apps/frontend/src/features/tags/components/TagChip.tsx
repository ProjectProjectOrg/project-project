import { Badge } from "@pp/ui/badge"
import { cn } from "@pp/ui/lib/utils"
import { X } from "lucide-react"

import { m } from "@/paraglide/messages"

type Props = {
  name: string
  color: string | null
  onRemove?: () => void
  size?: "xs" | "sm"
  className?: string
  pulse?: boolean
}

const NEUTRAL = "#94a3b8"

export function TagChip({
  name,
  color,
  onRemove,
  size = "sm",
  className,
  pulse
}: Props) {
  const hex = color ?? NEUTRAL
  return (
    <Badge
      data-slot="tag-chip"
      tone={null}
      size={size}
      className={cn(pulse && "animate-pulse", className)}
      // The tag's own hue goes through the badge's clean-colour recipe.
      style={{ "--badge-tone": hex }}
    >
      {name}
      {onRemove ? (
        <button
          type="button"
          aria-label={m.tags_remove_aria_label({ name })}
          onClick={onRemove}
          className="-mr-1 inline-flex size-4 items-center justify-center rounded transition-colors duration-100 hover:bg-black/10 active:scale-[0.97]"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </Badge>
  )
}
