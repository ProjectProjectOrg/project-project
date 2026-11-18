import { cn } from "../lib/utils"
import { CHECK_PATH, markClass } from "./checkbox"

/*
 * HexSwatch: a colour as a rounded, pointy-topped hexagon, lit like the
 * member avatars (a hairline edge and a soft light along the top). It fills
 * a button: a masked fill, plus an SVG for the edge, the light and the ring
 * the button shows when focused, which a mask would clip. Picked
 * ([aria-checked=true] on the button), the checkbox's check draws on over
 * it, in white or black, whichever reads on the colour. The ColorPicker's
 * dots and trigger.
 *
 * Pointy-topped hexagons tile a grid with horizontal rows exactly: their
 * flat sides face the six neighbours, so every gap is the same.
 */

const SQRT3 = Math.sqrt(3)
// Corner radius as a share of the width: 4px on a 28px dot, and the same
// proportion on the small icons, which would otherwise round into circles.
const ROUND = 4 / 28

// A hexagon `width` across its flats is this tall, point to point.
export const hexHeight = (width: number) => (2 * width) / SQRT3

const fixed = (n: number) => n.toFixed(2)

// A pointy-topped hexagon `width` across its flats, its corners rounded by
// `round`, centred on (cx, cy).
const hexPath = (width: number, round: number, cx: number, cy: number) => {
  const radius = width / SQRT3
  const corners = Array.from({ length: 6 }, (_, index) => {
    const angle = ((-90 + 60 * index) * Math.PI) / 180
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]
  })
  const share = round / radius
  const toward = (from: number[], to: number[]) =>
    `${fixed(from[0] + (to[0] - from[0]) * share)} ${fixed(from[1] + (to[1] - from[1]) * share)}`
  const sides = corners.map((corner, index) => {
    const before = corners[(index + 5) % 6]
    const after = corners[(index + 1) % 6]
    return `${index === 0 ? "M" : "L"}${toward(corner, before)} Q${fixed(corner[0])} ${fixed(corner[1])} ${toward(corner, after)}`
  })
  return `${sides.join(" ")} Z`
}

const masks = new Map<number, string>()
const hexMask = (width: number) => {
  const cached = masks.get(width)
  if (cached !== undefined) return cached
  const height = hexHeight(width)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fixed(width)} ${fixed(height)}"><path d="${hexPath(width, width * ROUND, width / 2, height / 2)}"/></svg>`
  const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  masks.set(width, url)
  return url
}

export function HexSwatch({
  width,
  fill,
  litId,
  empty = false,
  ink
}: Readonly<{
  width: number
  // Any CSS background; ignored when empty.
  fill?: string
  // An id for the light's gradient, unique on the page.
  litId: string
  // No colour: an outline with a slash.
  empty?: boolean
  // The check's colour when picked: "light" (white) on darker colours,
  // "dark" on lighter ones. Without it there's no check.
  ink?: "light" | "dark"
}>) {
  const height = hexHeight(width)
  const cx = width / 2
  const cy = height / 2
  // Strokes run on a path inset by half their width, so they sit inside
  // the shape like the avatars' inset edge.
  const round = width * ROUND
  const inner = hexPath(width - 1, round - 0.5, cx, cy)
  // The ring stands 1.5px off the shape.
  const ring = hexPath(width + 6, round + 3, cx, cy)
  return (
    <>
      {empty ? null : (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            background: fill,
            maskImage: hexMask(width),
            maskSize: "100% 100%"
          }}
        />
      )}
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full overflow-visible"
        viewBox={`0 0 ${fixed(width)} ${fixed(height)}`}
      >
        <defs>
          <linearGradient id={litId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: "var(--avatar-lit)" }} />
            <stop
              offset="0.3"
              style={{ stopColor: "var(--avatar-lit)", stopOpacity: 0 }}
            />
          </linearGradient>
        </defs>
        {empty ? (
          <>
            <path
              d={inner}
              fill="none"
              strokeWidth={1.5}
              className="stroke-border"
            />
            <path
              d={`M${fixed(width * 0.3)} ${fixed(cy + width * 0.2)} L${fixed(width * 0.7)} ${fixed(cy - width * 0.2)}`}
              strokeWidth={1.5}
              strokeLinecap="round"
              className="stroke-border"
            />
          </>
        ) : (
          <>
            <path
              d={inner}
              fill="none"
              strokeWidth={1}
              style={{ stroke: "var(--avatar-edge)" }}
            />
            <path
              d={inner}
              fill="none"
              strokeWidth={1}
              stroke={`url(#${litId})`}
            />
          </>
        )}
        <path
          data-slot="hex-swatch-ring"
          d={ring}
          fill="none"
          className="stroke-transparent stroke-[1.5] [:focus-visible>svg>&]:stroke-ring [:focus-visible>svg>&]:stroke-2"
        />
      </svg>
      {ink === undefined ? null : (
        <svg
          aria-hidden
          data-slot="hex-swatch-check"
          viewBox="0 0 16 16"
          className="pointer-events-none absolute top-1/2 left-1/2 size-4 -translate-1/2 overflow-visible"
        >
          <path
            pathLength={1}
            d={CHECK_PATH}
            className={cn(
              markClass,
              "stroke-2 motion-reduce:delay-0 [[aria-checked=true]>svg>&]:delay-60 [[aria-checked=true]>svg>&]:duration-160 [[aria-checked=true]>svg>&]:[stroke-dashoffset:0]"
            )}
            style={{
              stroke: ink === "light" ? "oklch(1 0 0)" : "oklch(0.2 0 0)"
            }}
          />
        </svg>
      )}
    </>
  )
}
