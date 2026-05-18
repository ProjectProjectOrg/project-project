import {
  DitherBackdrop,
  type DitherDirection,
  type DitherStops
} from "@/components/ui/button-dither"
import { cn } from "@/lib/utils"

type TileSize = "xs" | "sm" | "md" | "lg"

const SIZE_TO_CLASS: Record<TileSize, string> = {
  xs: "size-4 rounded-md text-[10px]",
  sm: "size-9 rounded-2xl text-lg",
  md: "size-10 rounded-2xl text-xl",
  lg: "size-12 rounded-2xl text-2xl"
}

type DitherVariant = {
  direction: DitherDirection
  stops: DitherStops
}

const DITHER_VARIANTS: ReadonlyArray<DitherVariant> = [
  { direction: "br", stops: [0, 1] },
  { direction: "bl", stops: [0, 1] },
  { direction: "tr", stops: [0, 1] },
  { direction: "tl", stops: [0, 1] },
  { direction: "br", stops: [0.15, 0.95] },
  { direction: "bl", stops: [0.15, 0.95] },
  { direction: "tr", stops: [0.15, 0.95] },
  { direction: "tl", stops: [0.15, 0.95] },
  { direction: "r", stops: [0.1, 0.9] },
  { direction: "l", stops: [0.1, 0.9] },
  { direction: "b", stops: [0.1, 0.9] },
  { direction: "t", stops: [0.1, 0.9] }
]

const djb2 = (s: string): number => {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const variantForSeed = (seed: string | undefined): DitherVariant =>
  seed
    ? DITHER_VARIANTS[djb2(`${seed}:dither`) % DITHER_VARIANTS.length]
    : DITHER_VARIANTS[0]

export function ProjectTile({
  icon,
  color,
  size,
  seed,
  waiting = false,
  className
}: {
  icon: string
  color: string
  size: TileSize
  seed?: string
  waiting?: boolean
  className?: string
}) {
  const variant = variantForSeed(seed)
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
        direction={variant.direction}
        stops={variant.stops}
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
