import type { CSSProperties } from "react"

export type Crop = {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export const coverCropStyle = (
  sourceAspect: number,
  containerAspect: number,
  crop: Crop
): CSSProperties => {
  const wide = sourceAspect > containerAspect
  const width = crop.zoom * 100 * (wide ? sourceAspect / containerAspect : 1)
  const height = crop.zoom * 100 * (wide ? 1 : containerAspect / sourceAspect)

  const offset = (size: number, position: number) =>
    `${-(size - 100) * position || 0}%`

  return {
    position: "absolute",
    maxWidth: "none",
    width: `${width}%`,
    height: `${height}%`,
    left: offset(width, crop.x),
    top: offset(height, crop.y)
  }
}
