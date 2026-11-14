import { cellSize, threshold } from "./bayer"
import { orbAvatar } from "./orbAvatar"

const cache = new Map<string, string>()

const clamp = (value: number) => Math.max(0, Math.min(1, value))

const paint = (userId: string, size: number, dpr: number) => {
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) return undefined
  const width = Math.round(size * dpr)
  const cell = Math.max(1, Math.round(cellSize(size) * dpr))
  canvas.width = width
  canvas.height = width
  const { palette, field } = orbAvatar(userId)
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

export const orbAvatarUrl = (
  userId: string,
  size: number
): string | undefined => {
  if (typeof window === "undefined") return undefined
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
  const key = `${userId}:${size}:${dpr}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const url = paint(userId, size, dpr)
  if (url !== undefined) cache.set(key, url)
  return url
}
