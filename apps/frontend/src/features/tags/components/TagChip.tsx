import { X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

type Props = {
  name: string
  color: string | null
  onRemove?: () => void
  size?: "xs" | "sm"
  intensity?: "soft" | "strong"
  className?: string
  pulse?: boolean
}

const NEUTRAL = "#94a3b8"

export function TagChip({
  name,
  color,
  onRemove,
  size = "sm",
  intensity = "soft",
  className,
  pulse
}: Props) {
  const hex = color ?? NEUTRAL
  const bgAlpha = intensity === "strong" ? "33" : "1a"
  return (
    <Badge
      data-slot="tag-chip"
      tone={null}
      size={size}
      className={cn(pulse && "animate-pulse", className)}
      style={{
        backgroundColor: `${hex}${bgAlpha}`,
        color: hex
      }}
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
