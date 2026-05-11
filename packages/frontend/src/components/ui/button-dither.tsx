"use client"

import { useEffect, useMemo, useState } from "react"
import { ImageDithering } from "@paper-design/shaders-react"
import { useInViewport } from "@/lib/use-in-viewport"

export type DitherDirection =
  | "r"
  | "l"
  | "t"
  | "b"
  | "tr"
  | "tl"
  | "br"
  | "bl"

export type DitherStops = readonly [number, number]

export interface DitherBackdropProps {
  from?: string
  to?: string
  direction?: DitherDirection
  stops?: DitherStops
  image?: string
}

const DIRECTION_TO_CSS_ANGLE: Record<DitherDirection, string> = {
  r: "to right",
  l: "to left",
  t: "to top",
  b: "to bottom",
  tr: "to top right",
  tl: "to top left",
  br: "to bottom right",
  bl: "to bottom left"
}

const DIRECTION_TO_SVG_VECTOR: Record<
  DitherDirection,
  { x1: string; y1: string; x2: string; y2: string }
> = {
  r: { x1: "0", y1: "0", x2: "1", y2: "0" },
  l: { x1: "1", y1: "0", x2: "0", y2: "0" },
  t: { x1: "0", y1: "1", x2: "0", y2: "0" },
  b: { x1: "0", y1: "0", x2: "0", y2: "1" },
  tr: { x1: "0", y1: "1", x2: "1", y2: "0" },
  tl: { x1: "1", y1: "1", x2: "0", y2: "0" },
  br: { x1: "0", y1: "0", x2: "1", y2: "1" },
  bl: { x1: "1", y1: "0", x2: "0", y2: "1" }
}

const DEFAULT_FROM = "#000000"
const DEFAULT_TO = "#ffffff"
const DEFAULT_DIRECTION: DitherDirection = "r"
const DEFAULT_STOPS: DitherStops = [0, 1]

function clampStops(stops: DitherStops): DitherStops {
  const start = Math.min(Math.max(stops[0], 0), 1)
  const end = Math.min(Math.max(stops[1], start), 1)
  return [start, end]
}

function cssGradient(
  from: string,
  to: string,
  direction: DitherDirection,
  stops: DitherStops
): string {
  const [start, end] = clampStops(stops)
  return (
    `linear-gradient(${DIRECTION_TO_CSS_ANGLE[direction]}, ` +
    `${from} ${start * 100}%, ${to} ${end * 100}%)`
  )
}

function resolveColor(value: string): string {
  if (!value.startsWith("var(")) return value
  if (typeof window === "undefined") return value
  const match = value.match(/var\(\s*(--[^,)\s]+)/)
  if (!match) return value
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(match[1])
    .trim()
  return resolved || value
}

function useThemeRevision(): number {
  const [rev, setRev] = useState(0)
  useEffect(() => {
    if (typeof window === "undefined") return
    const observer = new MutationObserver(() => setRev((r) => r + 1))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"]
    })
    return () => observer.disconnect()
  }, [])
  return rev
}

function gradientDataUrl(
  from: string,
  to: string,
  direction: DitherDirection,
  stops: DitherStops
): string {
  const v = DIRECTION_TO_SVG_VECTOR[direction]
  const [start, end] = clampStops(stops)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" preserveAspectRatio="none">` +
    `<defs><linearGradient id="g" x1="${v.x1}" y1="${v.y1}" x2="${v.x2}" y2="${v.y2}">` +
    `<stop offset="0" stop-color="${from}"/>` +
    `<stop offset="${start}" stop-color="${from}"/>` +
    `<stop offset="${end}" stop-color="${to}"/>` +
    `<stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>` +
    `<rect width="200" height="200" fill="url(#g)"/>` +
    `</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function DitherBackdrop({
  from = DEFAULT_FROM,
  to = DEFAULT_TO,
  direction = DEFAULT_DIRECTION,
  stops = DEFAULT_STOPS,
  image
}: DitherBackdropProps) {
  const [ref, inView] = useInViewport<HTMLSpanElement>()
  const themeRevision = useThemeRevision()
  const fallbackCss = image
    ? undefined
    : cssGradient(from, to, direction, stops)
  const shaderImage = useMemo(
    () => {
      if (image) return image
      return gradientDataUrl(
        resolveColor(from),
        resolveColor(to),
        direction,
        stops
      )
    },
    [image, from, to, direction, stops[0], stops[1], themeRevision]
  )

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      style={{
        backgroundImage: fallbackCss,
        backgroundSize: image ? "cover" : undefined,
        backgroundPosition: image ? "center" : undefined,
        backgroundColor: image ? "#000" : undefined
      }}
    >
      {inView && (
        <ImageDithering
          image={shaderImage}
          type="4x4"
          size={2}
          colorSteps={2}
          fit="cover"
          originalColors
          colorBack="#00000000"
          colorFront={to}
          colorHighlight={from}
          style={{ width: "100%", height: "100%" }}
        />
      )}
    </span>
  )
}
