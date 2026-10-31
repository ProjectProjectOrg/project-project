import { threshold } from "./dither"
import { beside, type Terminal } from "./terminal"

const LOGO = [
  "........m",
  "f....fmm.",
  "fff.fmm.m",
  "fff.ffmm.",
  "fff.fmm.m",
  "fff.ffmm.",
  "fff.fmm.m",
  "fff.ffmm.",
  "f....mm.m"
] as const

const COLUMNS = 9

const pixelValue = (column: number, row: number, progress: number) => {
  const delay = (column / COLUMNS) * 0.55 + threshold(column, row) * 0.25
  return Math.min(1, Math.max(0, (progress - delay) / 0.2))
}

const solid = (tone: "front" | "muted", terminal: Terminal) => {
  if (!terminal.fancy) return tone === "front" ? "██" : "▒▒"
  if (tone === "front") return "\x1b[7m  \x1b[27m"
  return terminal.color ? "\x1b[100m  \x1b[49m" : "▒▒"
}

const cell = (
  pixel: string,
  at: Readonly<{ column: number; row: number; progress: number }>,
  terminal: Terminal
) => {
  const value = pixelValue(at.column, at.row, at.progress)
  if (pixel === "." || value < 0.3) return "  "
  return pixel === "f" && value >= 1
    ? solid("front", terminal)
    : solid("muted", terminal)
}

export const markFrame = (
  terminal: Terminal,
  progress: number
): ReadonlyArray<string> =>
  LOGO.map((pixels, row) =>
    pixels
      .split("")
      .map((pixel, column) => cell(pixel, { column, row, progress }, terminal))
      .join("")
      .trimEnd()
  )

export const mark = (terminal: Terminal) => markFrame(terminal, 1)

export const LOGO_SHARE = 0.65

export const markWith = (
  right: ReadonlyArray<string>,
  terminal: Terminal,
  progress = 1
) =>
  beside(
    markFrame(terminal, Math.min(1, progress / LOGO_SHARE)),
    right.map((line, index) =>
      progress >= LOGO_SHARE + (index / right.length) * (1 - LOGO_SHARE)
        ? line
        : ""
    )
  )
