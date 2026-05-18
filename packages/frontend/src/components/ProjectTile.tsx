import { DitherBackdrop } from "@/components/ui/button-dither"
import { cn } from "@/lib/utils"

type TileSize = "xs" | "sm" | "md" | "lg"

const SIZE_TO_CLASS: Record<TileSize, string> = {
  xs: "size-4 rounded-md text-[10px]",
  sm: "size-9 rounded-2xl text-lg",
  md: "size-10 rounded-2xl text-xl",
  lg: "size-12 rounded-2xl text-2xl"
}

export function ProjectTile({
  icon,
  color,
  size,
  waiting = false,
  className
}: {
  icon: string
  color: string
  size: TileSize
  waiting?: boolean
  className?: string
}) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden corner-squircle leading-none shadow-sm transition-colors",
        SIZE_TO_CLASS[size],
        waiting && "animate-pulse",
        className
      )}
    >
      <DitherBackdrop
        from={`color-mix(in oklch, ${color} 60%, black 40%)`}
        to={color}
        direction="br"
        matrix="4x4"
        pixelSize={size === "xs" ? 1 : 2}
      />
      <span
        aria-hidden
        className="relative [filter:drop-shadow(0_1px_1.5px_rgba(0,0,0,0.35))]"
      >
        {icon}
      </span>
    </span>
  )
}
