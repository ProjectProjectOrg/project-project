import * as Effect from "effect/Effect"
import * as Random from "effect/Random"
import { useRef, useState } from "react"

import { cn } from "../lib/utils"
import { Dither, TimeWarpAnchor, type TimeWarpZone } from "./dither"

const EMPTY_WARP_ZONES: TimeWarpZone[] = [
  { anchor: TimeWarpAnchor.click(), radius: 0.7, strength: 3.2, falloff: 3.5 },
  {
    anchor: TimeWarpAnchor.fraction({ x: 0.5, y: 0.5 }),
    radius: 0.7,
    strength: 1.2,
    falloff: 4.5
  }
]

export type EmptyIntensity = "subtle" | "medium" | "strong"

// How loud the dither is. Its shape and density never change (they're
// balanced for every size); intensity only sets the ink's colour, pulled
// toward the paper (subtle) or toward the text (strong). Tokens in theme.css.
const INK: Readonly<Record<EmptyIntensity, string>> = {
  subtle: "var(--dither-front-subtle)",
  medium: "var(--dither-front)",
  strong: "var(--dither-front-strong)"
}

export type EmptyProps = React.ComponentProps<"div"> &
  Readonly<{
    // The dither drifts slowly; off, it holds still (it still reveals once,
    // and a click still ripples it). Reduced motion always holds it still.
    animated?: boolean
    intensity?: EmptyIntensity
  }>

// One empty state for every place: a page, a panel, a popover, ⌘K. It sizes
// its type and icon to its own width (container queries), so the same parts
// read right at 280px and at 1000px.
function Empty({
  className,
  animated = true,
  intensity = "medium",
  children,
  ...props
}: EmptyProps) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  // Each empty state samples its own patch of the noise, so two on one
  // screen (or the same one on two visits) never look stamped out.
  const [seed] = useState(() => Effect.runSync(Random.nextBetween(0, 64)))
  return (
    <div
      data-slot="empty"
      data-intensity={intensity}
      className={cn(
        "@container/empty relative grid min-h-[280px] animate-in place-items-center overflow-hidden rounded-[20px] bg-[color-mix(in_oklch,var(--background)_82%,var(--muted)_18%)] p-4 duration-500 [corner-shape:var(--button-corner)] fade-in",
        className
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0">
        <Dither
          disableAnimation={!animated}
          speed={animated ? 0.1 : 0}
          octaves={6}
          frequency={1.2}
          amplitude={0.52}
          lacunarity={2.2}
          rotationAngle={0.5}
          warpStrength={1.1}
          contrast={0.2}
          bias={-0.05}
          colorFront={INK[intensity]}
          seed={seed}
          pixelSize={2}
          ditherType="4x4"
          cardRef={cardRef}
          cardWellEnabled
          cardFalloff={60}
          cardCornerRadius={16}
          timeWarpZones={EMPTY_WARP_ZONES}
        />
      </div>
      <div
        ref={cardRef}
        className="relative flex max-w-sm min-w-0 animate-in flex-col items-center gap-1 px-4 py-3 text-center text-balance [overflow-wrap:anywhere] duration-500 zoom-in-95 fade-in @md/empty:px-6 @md/empty:py-5"
      >
        {children}
      </div>
    </div>
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn("flex flex-col items-center gap-1 text-center", className)}
      {...props}
    />
  )
}

export type EmptyMediaProps = React.ComponentProps<"div"> &
  Readonly<{
    // `icon` sets an icon (@pp/ui/icons) on a squircle tile; `default` leaves an
    // illustration as it is.
    variant?: "default" | "icon"
  }>

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: EmptyMediaProps) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(
        "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
        variant === "icon" &&
          "size-8 rounded-[10px] bg-active text-foreground [corner-shape:var(--button-corner)] @md/empty:size-10 @md/empty:rounded-[12px] [&_svg:not([class*='size-'])]:size-4 @md/empty:[&_svg:not([class*='size-'])]:size-5",
        className
      )}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn(
        "text-subtitle font-semibold text-foreground @md/empty:text-title",
        className
      )}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-body text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-foreground",
        className
      )}
      {...props}
    />
  )
}

// The actions: one button, or a row of them. Sits 12px under the message.
function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "mt-3 flex w-full min-w-0 flex-col items-center gap-3 text-body",
        className
      )}
      {...props}
    />
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia
}
