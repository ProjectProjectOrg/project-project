import { useEffect, useState, type RefObject } from "react"

/*
 * Reading the theme's tokens as the browser resolves them, for the design
 * system pages: a token's colour (any CSS colour, oklch included) as sRGB,
 * and WCAG contrast between two of them. Re-reads when the theme changes.
 */

export type Rgb = readonly [number, number, number]

let canvas: CanvasRenderingContext2D | null = null

// Paints a CSS colour over `base` on a 1px canvas and reads the pixel, so
// translucent tokens (the overlays) resolve to what they look like there.
export const toRgb = (color: string, base = "#00000000"): Rgb => {
  canvas ??= document.createElement("canvas").getContext("2d", {
    willReadFrequently: true
  })
  if (canvas === null) return [0, 0, 0]
  canvas.clearRect(0, 0, 1, 1)
  canvas.fillStyle = base
  canvas.fillRect(0, 0, 1, 1)
  canvas.fillStyle = color
  canvas.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = canvas.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

const channel = (value: number) => {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

export const contrast = (a: Rgb, b: Rgb): number => {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].toSorted(
    (x, y) => y - x
  )
  return (hi + 0.05) / (lo + 0.05)
}

// A token's resolved colour, read off a probe element inside `scope` (so a
// demo's own theme applies).
export const tokenColor = (scope: HTMLElement, token: string): string => {
  const probe = document.createElement("span")
  probe.style.color = `var(${token})`
  scope.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color
}

// Bumps when the page's theme changes, so readings refresh.
export function useThemeVersion(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    const observer = new MutationObserver(() => setVersion((v) => v + 1))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"]
    })
    return () => observer.disconnect()
  }, [])
  return version
}

// Reads `read(scope)` after mount and whenever the theme changes.
export function useTokenReading<T>(
  scope: RefObject<HTMLElement | null>,
  read: (scope: HTMLElement) => T
): T | null {
  const version = useThemeVersion()
  const [value, setValue] = useState<T | null>(null)
  useEffect(() => {
    if (scope.current === null) return undefined
    // A frame later, so the theme's styles have applied.
    const frame = requestAnimationFrame(() => {
      if (scope.current !== null) setValue(read(scope.current))
    })
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads on theme change
  }, [version])
  return value
}

export const ratio = (value: number) => `${value.toFixed(1)}:1`
