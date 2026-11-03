import { muted, type Terminal } from "./terminal"

export const SHADES = [" ", "░", "▒", "▓", "█"] as const

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5]
] as const

export const threshold = (x: number, y: number) =>
  (BAYER[y % 4]?.[x % 4] ?? 0) / 16 + 1 / 32

export const shadeAt = (x: number, y: number, value: number) => {
  const scaled = Math.min(1, Math.max(0, value)) * (SHADES.length - 1)
  const base = Math.floor(scaled)
  const level = Math.min(
    SHADES.length - 1,
    base + (scaled - base > threshold(x, y) ? 1 : 0)
  )
  return SHADES[level] ?? " "
}

export const dither = (
  size: Readonly<{ width: number; height: number }>,
  value: (x: number, y: number) => number
) =>
  Array.from({ length: size.height }, (_, y) =>
    Array.from({ length: size.width }, (_, x) =>
      shadeAt(x, y, value(x, y))
    ).join("")
  )

export const paintShades = (line: string, terminal: Terminal) =>
  line.replace(/[░▒]+/g, (light) => muted(light, terminal))
