import { hashId } from "./avatarColor"
import { cellSize, threshold } from "./bayer"
import {
  between,
  chance,
  clamp,
  fbm,
  normalize,
  pick,
  random,
  type Random,
  valueNoise,
  type Vec
} from "./orbMath"
import { PATTERN_NAMES, PATTERNS } from "./orbPatterns"

/*
 * A project's generated tile, the square sibling of the member orbs
 * (orbAvatar): one seed (the project's id) picks a surface pattern, a light
 * direction and a texture, and the project's own colour sets the palette. It
 * is painted through the same 4×4 ordered dither, so tiles and avatars read
 * as one family.
 */

type Oklch = Readonly<{ L: number; C: number; h: number }>

// sRGB hex to OKLCH (Björn Ottosson's matrices).
const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

export const hexToOklch = (hex: string): Oklch => {
  const value = Number.parseInt(hex.replace("#", ""), 16)
  const r = toLinear(((value >> 16) & 255) / 255)
  const g = toLinear(((value >> 8) & 255) / 255)
  const b = toLinear((value & 255) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const h = (Math.atan2(B, A) * 180) / Math.PI
  return { L, C: Math.hypot(A, B), h: h < 0 ? h + 360 : h }
}

const css = ({ L, C, h }: Oklch) =>
  `oklch(${clamp(L).toFixed(3)} ${Math.max(0, C).toFixed(3)} ${((h % 360) + 360) % 360})`

// Light runs across the tile from one side or corner; flat tiles have none.
type Light = "diagonal" | "side" | "flat"
const LIGHTS: ReadonlyArray<Light> = ["diagonal", "diagonal", "side", "flat"]
const LIGHT_WEIGHT: Readonly<Record<Light, number>> = {
  diagonal: 0.6,
  side: 0.45,
  flat: 0
}

export type ProjectTile = Readonly<{
  palette: ReadonlyArray<string>
  field: (u: number, v: number) => number
  traits: ReadonlyArray<string>
}>

// Five steps from deep to lit, all in the project's hue, with a seeded nudge
// of the hue toward its neighbours at the ends so the tile has some depth.
const tilePalette = (next: Random, base: Oklch) => {
  const drift = pick(next, [-24, -12, 12, 24])
  const tone = (dL: number, k: number, dh: number) =>
    css({ L: base.L + dL, C: base.C * k, h: base.h + dh })
  return [
    tone(-0.26, 0.85, drift),
    tone(-0.14, 0.95, drift / 2),
    tone(0, 1, 0),
    tone(0.08, 0.9, -drift / 2),
    tone(0.16, 0.7, -drift)
  ]
}

export const projectTile = (seed: string, color: string): ProjectTile => {
  const next = random(hashId(`${seed}:tile`))
  const noiseSeed = hashId(`${seed}:noise`)
  const palette = tilePalette(next, hexToOklch(color))
  const patternName = pick(next, PATTERN_NAMES)
  const pattern = PATTERNS[patternName](next, noiseSeed)
  const amplitude = between(next, 0.18, 0.34)
  const zoom = between(next, 0.7, 1.6)
  const light = pick(next, LIGHTS)
  const angle = next() * Math.PI * 2
  const lightX = Math.cos(angle)
  const lightY = Math.sin(angle)
  const lightWeight = LIGHT_WEIGHT[light]
  const mottle = fbm(valueNoise(noiseSeed + 13), 3)
  const roughness = between(next, 0.1, 0.6)
  const glow = chance(next, 0.3)
    ? { x: between(next, 0.2, 0.8), y: between(next, 0.2, 0.8) }
    : null

  const field = (u: number, v: number) => {
    const x = (u - 0.5) * 2
    const y = (v - 0.5) * 2
    // The plane, bent onto a shallow dome so the sphere patterns read.
    const p: Vec = normalize([x * zoom, y * zoom, 1.6])
    const ramp = (x * lightX + y * lightY) * -0.5
    const lit = light === "diagonal" ? ramp : ramp * 0.8
    const halo = glow
      ? Math.max(0, 1 - Math.hypot(u - glow.x, v - glow.y) * 2.2) * 0.25
      : 0
    return (
      0.5 +
      lit * lightWeight +
      pattern(p) * amplitude +
      (mottle(p) - 0.5) * 0.35 * roughness +
      halo
    )
  }

  const traits = [
    patternName,
    `${light} light`,
    ...(glow ? ["glow"] : [])
  ]
  return { palette, field, traits }
}

const cache = new Map<string, string>()

const paint = (seed: string, color: string, size: number, dpr: number) => {
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")
  if (!context) return undefined
  const width = Math.round(size * dpr)
  const cell = Math.max(1, Math.round(cellSize(size) * dpr))
  canvas.width = width
  canvas.height = width
  const { palette, field } = projectTile(seed, color)
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

// The painted tile as a data URL, cached per seed, colour, size and density.
export const projectTileUrl = (
  seed: string,
  color: string,
  size: number
): string | undefined => {
  if (typeof window === "undefined") return undefined
  const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1))
  const key = `${seed}:${color}:${size}:${dpr}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const url = paint(seed, color, size, dpr)
  if (url !== undefined) cache.set(key, url)
  return url
}
