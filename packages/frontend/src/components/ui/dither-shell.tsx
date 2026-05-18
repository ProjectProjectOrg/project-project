import { useRef, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import { Dither, type TimeWarpZone } from "@/components/ui/dither"

const STATIC_WARP_ZONES: TimeWarpZone[] = [
  {
    anchor: { type: "fraction", x: 0.5, y: 0.5 },
    radius: 0.77,
    strength: 3,
    falloff: 4.85
  }
]

const ANIMATED_WARP_ZONES: TimeWarpZone[] = [
  {
    anchor: { type: "fraction", x: 0.5, y: 0.5 },
    radius: 0.85,
    strength: 2.4,
    falloff: 4.2
  }
]

type DitherShellProps = {
  children: ReactNode
  animated?: boolean
  cardClassName?: string
}

export function DitherShell({
  children,
  animated = false,
  cardClassName
}: DitherShellProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[color-mix(in_oklch,var(--background)_82%,var(--muted)_18%)] p-6">
      <div className="pointer-events-none absolute inset-0">
        <Dither
          disableAnimation={!animated}
          speed={animated ? 0.09 : 0}
          octaves={7}
          frequency={2.2}
          amplitude={0.52}
          lacunarity={2.2}
          rotationAngle={0.5}
          warpStrength={animated ? 1.18 : 1.32}
          contrast={0.2}
          bias={-0.07}
          pixelSize={3}
          ditherType="4x4"
          cardRef={cardRef}
          cardWellEnabled
          cardFalloff={80}
          cardCornerRadius={16}
          timeWarpZones={animated ? ANIMATED_WARP_ZONES : STATIC_WARP_ZONES}
        />
      </div>
      <div
        ref={cardRef}
        className={cn(
          "relative flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-[color-mix(in_oklch,var(--background)_45%,var(--muted)_55%)] animate-in fade-in zoom-in-95 duration-700",
          cardClassName
        )}
      >
        {children}
      </div>
    </main>
  )
}
