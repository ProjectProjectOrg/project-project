"use client"

import { useEffect, useMemo, useRef, useState } from "react"

export type DitherDirection = "r" | "l" | "t" | "b" | "tr" | "tl" | "br" | "bl"

export type DitherStops = readonly [number, number]
export type DitherMatrix = "2x2" | "4x4" | "8x8"

export interface DitherBackdropProps {
  from?: string
  to?: string
  direction?: DitherDirection
  stops?: DitherStops
  hoverStops?: DitherStops
  hoverDuration?: number
  hover?: boolean
  matrix?: DitherMatrix
  pixelSize?: number
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

const DIRECTION_TO_VECTOR: Record<DitherDirection, [number, number]> = {
  r: [1, 0],
  l: [-1, 0],
  t: [0, -1],
  b: [0, 1],
  tr: [1, -1],
  tl: [-1, -1],
  br: [1, 1],
  bl: [-1, 1]
}

const DEFAULT_FROM = "#000000"
const DEFAULT_TO = "#ffffff"
const DEFAULT_DIRECTION: DitherDirection = "r"
const DEFAULT_STOPS: DitherStops = [0, 1]
const DEFAULT_MATRIX: DitherMatrix = "4x4"
const DEFAULT_PIXEL_SIZE = 3

const BAYER_2X2 = [0, 2, 3, 1].map((v) => (v + 0.5) / 4)
const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(
  (v) => (v + 0.5) / 16
)
const BAYER_8X8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36,
  14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41,
  51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23,
  61, 29, 53, 21
].map((v) => (v + 0.5) / 64)

const MATRIX_SIZE: Record<DitherMatrix, number> = {
  "2x2": 2,
  "4x4": 4,
  "8x8": 8
}
const MATRIX_DATA: Record<DitherMatrix, ReadonlyArray<number>> = {
  "2x2": BAYER_2X2,
  "4x4": BAYER_4X4,
  "8x8": BAYER_8X8
}

interface RGB {
  r: number
  g: number
  b: number
}

function clampStops(stops: DitherStops): DitherStops {
  const start = Math.min(Math.max(stops[0], 0), 1)
  const end = Math.min(Math.max(stops[1], start + 0.0001), 1)
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

function parseColorToRgb(value: string): RGB {
  if (typeof window === "undefined") return { r: 0, g: 0, b: 0 }
  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext("2d", { willReadFrequently: true })
  if (!ctx) return { r: 0, g: 0, b: 0 }
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillStyle = value
  ctx.fillRect(0, 0, 1, 1)
  const data = ctx.getImageData(0, 0, 1, 1).data
  return { r: data[0], g: data[1], b: data[2] }
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function drawDither(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  fromRgb: RGB,
  toRgb: RGB,
  direction: DitherDirection,
  stops: DitherStops,
  matrix: DitherMatrix
) {
  if (width <= 0 || height <= 0) return
  const img = ctx.createImageData(width, height)
  const data = img.data
  const [vx, vy] = DIRECTION_TO_VECTOR[direction]
  const [start, end] = clampStops(stops)
  const span = end - start
  const denomX = Math.max(width - 1, 1)
  const denomY = Math.max(height - 1, 1)
  const projMax = Math.abs(vx) + Math.abs(vy)
  const m = MATRIX_DATA[matrix]
  const mSize = MATRIX_SIZE[matrix]

  let i = 0
  for (let y = 0; y < height; y++) {
    const ny = vy >= 0 ? y / denomY : (height - 1 - y) / denomY
    const projY = Math.abs(vy) * ny
    for (let x = 0; x < width; x++) {
      const nx = vx >= 0 ? x / denomX : (width - 1 - x) / denomX
      const projX = Math.abs(vx) * nx
      const u = (projX + projY) / projMax
      let t = (u - start) / span
      if (t < 0) t = 0
      else if (t > 1) t = 1
      const threshold = m[(y % mSize) * mSize + (x % mSize)]
      const useTo = t > threshold
      const c = useTo ? toRgb : fromRgb
      data[i] = c.r
      data[i + 1] = c.g
      data[i + 2] = c.b
      data[i + 3] = 255
      i += 4
    }
  }
  ctx.putImageData(img, 0, 0)
}

export function DitherBackdrop({
  from = DEFAULT_FROM,
  to = DEFAULT_TO,
  direction = DEFAULT_DIRECTION,
  stops = DEFAULT_STOPS,
  hoverStops,
  hoverDuration = 250,
  hover = false,
  matrix = DEFAULT_MATRIX,
  pixelSize = DEFAULT_PIXEL_SIZE
}: DitherBackdropProps) {
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const themeRevision = useThemeRevision()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 })
  const stopsRef = useRef<DitherStops>(stops)
  const rafRef = useRef<number | null>(null)
  const animStartRef = useRef<number>(0)
  const animFromRef = useRef<DitherStops>(stops)
  const animToRef = useRef<DitherStops>(stops)

  const colors = useMemo(() => {
    const fromRgb = parseColorToRgb(resolveColor(from))
    const toRgb = parseColorToRgb(resolveColor(to))
    return { fromRgb, toRgb }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- themeRevision is the signal to re-resolve CSS vars
  }, [from, to, themeRevision])

  const colorsRef = useRef(colors)
  useEffect(() => {
    colorsRef.current = colors
  }, [colors])

  const directionRef = useRef(direction)
  useEffect(() => {
    directionRef.current = direction
  }, [direction])

  const matrixRef = useRef(matrix)
  useEffect(() => {
    matrixRef.current = matrix
  }, [matrix])

  const paint = (currentStops: DitherStops) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const { w, h } = sizeRef.current
    drawDither(
      ctx,
      w,
      h,
      colorsRef.current.fromRgb,
      colorsRef.current.toRgb,
      directionRef.current,
      currentStops,
      matrixRef.current
    )
  }

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const resize = () => {
      const rect = wrap.getBoundingClientRect()
      const scale = Math.max(1, pixelSize)
      const w = Math.max(1, Math.round(rect.width / scale))
      const h = Math.max(1, Math.round(rect.height / scale))
      if (sizeRef.current.w === w && sizeRef.current.h === h) return
      sizeRef.current = { w, h }
      canvas.width = w
      canvas.height = h
      paint(stopsRef.current)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [pixelSize])

  useEffect(() => {
    paint(stopsRef.current)
  }, [colors, direction, matrix, pixelSize])

  const stops0 = stops[0]
  const stops1 = stops[1]
  const hoverStops0 = hoverStops?.[0]
  const hoverStops1 = hoverStops?.[1]
  useEffect(() => {
    const target: DitherStops = hover && hoverStops ? hoverStops : stops
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    if (!hoverStops || reduceMotion) {
      stopsRef.current = target
      paint(target)
      return
    }
    animFromRef.current = [stopsRef.current[0], stopsRef.current[1]]
    animToRef.current = target
    animStartRef.current = performance.now()
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    const tick = (now: number) => {
      const elapsed = now - animStartRef.current
      const t = Math.min(elapsed / hoverDuration, 1)
      const e = easeOutCubic(t)
      const next: DitherStops = [
        lerp(animFromRef.current[0], animToRef.current[0], e),
        lerp(animFromRef.current[1], animToRef.current[1], e)
      ]
      stopsRef.current = next
      paint(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        rafRef.current = null
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- track stops/hoverStops by element to avoid array-identity churn
  }, [hover, hoverStops0, hoverStops1, stops0, stops1, hoverDuration])

  const fallbackCss = cssGradient(from, to, direction, stops)

  return (
    <span
      ref={wrapRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
      style={{ backgroundImage: fallbackCss }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ imageRendering: "pixelated" }}
      />
    </span>
  )
}
