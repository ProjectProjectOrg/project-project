import { cellSize, threshold } from "./bayer"
import { clamp } from "./orbMath"

/*
 * The painter behind the member orbs (orbAvatar) and the project tiles
 * (projectTile). A generator returns a scene: a field of 0–1 values over the
 * unit square and a palette from deep to lit. The painter samples the field
 * once per cell and picks between the two nearest palette steps with the 4×4
 * ordered dither, so everything it paints reads as one family.
 */

export type DitherScene = Readonly<{
  palette: ReadonlyArray<string>
  field: (u: number, v: number) => number
  // What the seed picked, for the gallery's explore demos.
  traits: ReadonlyArray<string>
}>

// The device pixel ratio, between 1 and 3.
export const pixelRatio = () =>
  Math.min(3, Math.max(1, window.devicePixelRatio || 1))

const paint = ({ palette, field }: DitherScene, size: number, dpr: number) => {
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) return undefined
  const width = Math.round(size * dpr)
  const cell = Math.max(1, Math.round(cellSize(size) * dpr))
  canvas.width = width
  canvas.height = width
  const steps = palette.length - 1
  const cells = Math.ceil(width / cell)
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const t =
        clamp(field(((cx + 0.5) * cell) / width, ((cy + 0.5) * cell) / width)) *
        steps
      const low = Math.min(steps - 1, Math.floor(t))
      context.fillStyle = palette[t - low > threshold(cx, cy) ? low + 1 : low]
      context.fillRect(cx * cell, cy * cell, cell, cell)
    }
  }
  return canvas.toDataURL("image/png")
}

const cache = new Map<string, string>()

// A scene painted as a square PNG data URL, `size` px a side at the screen's
// density. Cached by `key` (which must name everything the scene depends
// on), size and density; `scene` only runs on a miss.
export const ditheredUrl = (
  key: string,
  scene: () => DitherScene,
  size: number
) => {
  if (typeof window === "undefined") return undefined
  const dpr = pixelRatio()
  const id = `${key}:${size}:${dpr}`
  const cached = cache.get(id)
  if (cached !== undefined) return cached
  const url = paint(scene(), size, dpr)
  if (url !== undefined) cache.set(id, url)
  return url
}
