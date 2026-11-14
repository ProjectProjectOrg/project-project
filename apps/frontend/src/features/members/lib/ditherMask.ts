import { cellSize, threshold } from "./bayer"

const cache = new Map<string, string>()

const paint = (from: number, to: number, cell: number) => {
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) return undefined
  canvas.width = cell * 4
  canvas.height = cell * 4
  context.fillStyle = "#000"
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const t = threshold(x, y)
      if (t >= from && t < to) {
        context.fillRect(x * cell, y * cell, cell, cell)
      }
    }
  }
  return canvas.toDataURL("image/png")
}

export const ditherBandStyle = (from: number, to: number, size: number) => {
  if (typeof window === "undefined") return undefined
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
  const cell = cellSize(size)
  const key = `${from}:${to}:${cell}:${dpr}`
  const url =
    cache.get(key) ?? paint(from, to, Math.max(1, Math.round(cell * dpr)))
  if (url === undefined) return undefined
  cache.set(key, url)
  const tile = `${cell * 4}px ${cell * 4}px`
  return {
    maskImage: `url(${url})`,
    maskSize: tile,
    maskRepeat: "repeat",
    WebkitMaskImage: `url(${url})`,
    WebkitMaskSize: tile,
    WebkitMaskRepeat: "repeat"
  }
}
