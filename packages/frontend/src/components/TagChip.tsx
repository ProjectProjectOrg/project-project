import { X } from "lucide-react"
import { cn } from "@/lib/utils"

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
  const sizeClasses =
    size === "xs"
      ? "h-5 px-1.5 text-[11px]"
      : "h-6 px-2 py-0.5 text-xs"
  return (
    <span
      data-slot="tag-chip"
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 rounded-md font-medium transition-colors",
        sizeClasses,
        pulse && "animate-pulse",
        className
      )}
      style={{
        backgroundColor: `${hex}1a`,
        color: hex
      }}
    >
      {name}
      {onRemove ? (
        <button
          type="button"
          aria-label={`Remove tag ${name}`}
          onClick={onRemove}
          className="-mr-1 inline-flex size-4 items-center justify-center rounded transition-colors duration-100 hover:bg-black/10 active:scale-[0.97]"
        >
          <X className="size-3" />
        </button>
      ) : null}
    </span>
  )
}
