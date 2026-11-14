import type { ColorSwatch } from "@pp/shared"

import { avatarColor, hashId, wheelSwatch } from "./avatarColor"
import {
  between,
  chance,
  clamp,
  dot,
  fbm,
  normalize,
  onSphere,
  pick,
  random,
  type Random,
  smoothstep,
  valueNoise,
  type Vec
} from "./orbMath"
import { PATTERN_NAMES, PATTERNS, type Surface } from "./orbPatterns"

type Lighting = "front" | "side" | "crescent" | "rim" | "flat"

type Crater = Readonly<{ center: Vec; radius: number }>

export type OrbAvatar = Readonly<{
  palette: ReadonlyArray<string>
  ink: Readonly<{ light: string; dark: string }>
  field: (u: number, v: number) => number
  traits: ReadonlyArray<string>
}>

const LIGHTING: ReadonlyArray<Lighting> = [
  "front",
  "front",
  "front",
  "side",
  "side",
  "crescent",
  "rim",
  "flat"
]
const LIGHT_SPREAD = {
  front: 0.6,
  side: 0.85,
  crescent: 0.92,
  rim: 0.6,
  flat: 0.6
}
const LIGHT_HEIGHT = {
  front: 0.53,
  side: 0.3,
  crescent: 0.12,
  rim: 0.53,
  flat: 0.53
}
const TEXTURE = 0.55
const ACCENT_SHIFTS: ReadonlyArray<number> = [90, 120, 150, 180, 210, 240]
const DEEP_SHIFTS: ReadonlyArray<number> = [60, 90, 120, 240, 270]
const INK_LIGHT = { L: 0.3, C: 0.1 }
const INK_DARK = { L: 0.97, C: 0.025 }

const css = (L: number, C: number, hue: number, opacity = 1) =>
  `oklch(${L.toFixed(3)} ${C.toFixed(3)} ${hue % 360}${opacity < 1 ? ` / ${opacity}` : ""})`

const tone = (swatch: ColorSwatch, opacity: number) =>
  css(swatch.L, swatch.C, swatch.hue, opacity)

const orbColors = (userId: string) => {
  const next = random(hashId(`${userId}:colours`))
  const base = avatarColor(userId)
  const accentHue = (base.hue + pick(next, ACCENT_SHIFTS)) % 360
  const deepHue = (accentHue + pick(next, DEEP_SHIFTS)) % 360
  const accent = wheelSwatch(accentHue)
  const deep = wheelSwatch(deepHue === base.hue % 360 ? deepHue + 30 : deepHue)
  return {
    palette: [
      tone(deep, 0.5),
      tone(accent, 0.56),
      tone(accent, 0.4),
      tone(base, 0.34),
      tone(base, 0.2)
    ],
    ink: {
      light: css(INK_LIGHT.L, INK_LIGHT.C, accent.hue),
      dark: css(INK_DARK.L, INK_DARK.C, accent.hue)
    }
  }
}

const rotation = (next: Random) => {
  const [ax, ay, az] = onSphere(next)
  const angle = next() * Math.PI * 2
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  return ([x, y, z]: Vec): Vec => [
    (t * ax * ax + c) * x +
      (t * ax * ay - s * az) * y +
      (t * ax * az + s * ay) * z,
    (t * ax * ay + s * az) * x +
      (t * ay * ay + c) * y +
      (t * ay * az - s * ax) * z,
    (t * ax * az - s * ay) * x +
      (t * ay * az + s * ax) * y +
      (t * az * az + c) * z
  ]
}

const lightDirection = (next: Random, lighting: Lighting): Vec => {
  const angle = next() * Math.PI * 2
  const spread = LIGHT_SPREAD[lighting]
  return normalize([
    Math.cos(angle) * spread,
    Math.sin(angle) * spread,
    LIGHT_HEIGHT[lighting]
  ])
}

const shading = (lighting: Lighting, direction: Vec) => (normal: Vec) => {
  if (lighting === "flat") return 0.5
  if (lighting === "rim") return 0.15 + (1 - normal[2]) ** 1.5 * 0.85
  return Math.max(0, dot(normal, direction))
}

const crater = (next: Random): Crater => {
  const angle = next() * Math.PI * 2
  const distance = Math.sqrt(next()) * 0.8
  const x = Math.cos(angle) * distance
  const y = Math.sin(angle) * distance
  return {
    center: [x, y, Math.sqrt(1 - x * x - y * y)],
    radius: 0.12 + next() * next() * 0.3
  }
}

export const orbAvatar = (userId: string): OrbAvatar => {
  const next = random(hashId(`${userId}:orb`))
  const seed = hashId(`${userId}:noise`)
  const lighting = pick(next, LIGHTING)
  const direction = lightDirection(next, lighting)
  const lit = shading(lighting, direction)
  const rotate = rotation(next)
  const primaryName = pick(next, PATTERN_NAMES)
  const primary = PATTERNS[primaryName](next, seed)
  const amplitude = between(next, 0.3, 0.5) * (lighting === "flat" ? 1.3 : 1)
  const lightWeight = lighting === "flat" ? 0 : between(next, 0.45, 0.75)
  const secondaryName = chance(next, 0.5)
    ? pick(
        next,
        PATTERN_NAMES.filter((name) => name !== primaryName)
      )
    : null
  const secondary: Surface | null = secondaryName
    ? PATTERNS[secondaryName](next, seed + 7)
    : null
  const secondaryAmplitude = between(next, 0.08, 0.16)
  const mottle = fbm(valueNoise(seed + 13), 3)
  const roughness = between(next, 0.1, 0.8)
  const craters = chance(next, 0.45)
    ? Array.from({ length: 1 + Math.floor(next() * 5) }, () => crater(next))
    : []
  const cap = chance(next, 0.2)
    ? { pole: onSphere(next), size: between(next, 0.6, 0.85) }
    : null
  const glint = lighting !== "flat" && lighting !== "rim" && chance(next, 0.25)
  const halfway = normalize([direction[0], direction[1], direction[2] + 1])

  const craterShade = (normal: Vec, light: number) =>
    craters.reduce((total, { center, radius }) => {
      const distance = Math.acos(clamp(dot(normal, center), -1, 1))
      if (distance > radius * 1.25) return total
      const dx = normal[0] - center[0]
      const dy = normal[1] - center[1]
      const length = Math.hypot(dx, dy) || 1
      const side = (dx / length) * direction[0] + (dy / length) * direction[1]
      const shade =
        distance < radius
          ? -0.1 - side * 0.4 * (distance / radius)
          : side * 0.3 * (1 - (distance - radius) / (radius * 0.25))
      return total + shade * (0.35 + light)
    }, 0)

  const sphere = (x: number, y: number) => {
    const normal: Vec = [x, y, Math.sqrt(Math.max(0, 1 - x * x - y * y))]
    const p = rotate(normal)
    const light = lit(normal)
    const pattern =
      primary(p) * amplitude +
      (secondary ? secondary(p) * secondaryAmplitude : 0)
    const texture =
      (mottle(p) - 0.5) * 0.45 * roughness + craterShade(normal, light)
    const polar = cap
      ? smoothstep(cap.size - 0.04, cap.size, dot(p, cap.pole)) * 0.4
      : 0
    const shine = glint ? Math.max(0, dot(normal, halfway)) ** 28 * 0.6 : 0
    return (
      0.5 +
      (light - 0.5) * lightWeight +
      pattern +
      texture * TEXTURE +
      polar +
      shine
    )
  }

  const scene = (u: number, v: number) => {
    const x = (u - 0.5) * 2
    const y = (v - 0.5) * 2
    const distance = Math.hypot(x, y)
    return distance > 1 ? sphere(x / distance, y / distance) : sphere(x, y)
  }

  const traits = [
    primaryName,
    ...(secondaryName ? [`+ ${secondaryName}`] : []),
    `${lighting} light`,
    ...(cap ? ["polar cap"] : []),
    ...(craters.length > 0 ? [`${craters.length} craters`] : []),
    ...(glint ? ["glint"] : [])
  ]

  return { ...orbColors(userId), field: scene, traits }
}

export const avatarInitials = (
  name: string | null | undefined,
  email: string | null | undefined,
  size: number
): string => {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return (email ?? "?").charAt(0).toUpperCase()
  const first = words[0].charAt(0).toUpperCase()
  if (size < 24 || words.length === 1) return first
  const capitalised = words
    .slice(1)
    .filter((word) => word.charAt(0) !== word.charAt(0).toLowerCase())
  const last = capitalised.at(-1) ?? words[words.length - 1]
  return first + last.charAt(0).toUpperCase()
}
