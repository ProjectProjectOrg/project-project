import { avatarColor, hashId } from "./avatarColor"
import { ditheredUrl, type DitherScene } from "./ditherPaint"
import { ditherPalette } from "./ditherPalette"
import {
  between,
  chance,
  clamp,
  dot,
  normalize,
  onSphere,
  pick,
  random,
  type Random,
  smoothstep,
  type Vec
} from "./orbMath"
import { mottle, pickPattern, type Surface } from "./orbPatterns"

type Lighting = "front" | "side" | "crescent" | "rim" | "flat"

type Crater = Readonly<{ center: Vec; radius: number }>

export type OrbAvatar = DitherScene &
  Readonly<{ ink: Readonly<{ light: string; dark: string }> }>

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

const orbColors = (userId: string) => {
  const { hue, L, C } = avatarColor(userId)
  return ditherPalette(
    random(hashId(`${userId}:colours`)),
    { L, C, h: hue },
    "multi"
  )
}

const rotation = (next: Random) => {
  const [ax, ay, az] = onSphere(next)
  const angle = next() * Math.PI * 2
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  return ([x, y, z]: Vec) =>
    [
      (t * ax * ax + c) * x +
        (t * ax * ay - s * az) * y +
        (t * ax * az + s * ay) * z,
      (t * ax * ay + s * az) * x +
        (t * ay * ay + c) * y +
        (t * ay * az - s * ax) * z,
      (t * ax * az - s * ay) * x +
        (t * ay * az + s * ax) * y +
        (t * az * az + c) * z
    ] satisfies Vec
}

const lightDirection = (next: Random, lighting: Lighting) => {
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

const crater = (next: Random) => {
  const angle = next() * Math.PI * 2
  const distance = Math.sqrt(next()) * 0.8
  const x = Math.cos(angle) * distance
  const y = Math.sin(angle) * distance
  return {
    center: [x, y, Math.sqrt(1 - x * x - y * y)],
    radius: 0.12 + next() * next() * 0.3
  } satisfies Crater
}

export const orbAvatar = (userId: string) => {
  const next = random(hashId(`${userId}:orb`))
  const seed = hashId(`${userId}:noise`)
  const lighting = pick(next, LIGHTING)
  const direction = lightDirection(next, lighting)
  const lit = shading(lighting, direction)
  const rotate = rotation(next)
  const { name: primaryName, surface: primary } = pickPattern(next, seed)
  const amplitude = between(next, 0.3, 0.5) * (lighting === "flat" ? 1.3 : 1)
  const lightWeight = lighting === "flat" ? 0 : between(next, 0.45, 0.75)
  const secondaryPick = chance(next, 0.5)
    ? pickPattern(next, seed + 7, primaryName)
    : null
  const secondaryName = secondaryPick?.name ?? null
  const secondary: Surface | null = secondaryPick?.surface ?? null
  const secondaryAmplitude = between(next, 0.08, 0.16)
  const texture = mottle(seed)
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
    const grain =
      (texture(p) - 0.5) * 0.45 * roughness + craterShade(normal, light)
    const polar = cap
      ? smoothstep(cap.size - 0.04, cap.size, dot(p, cap.pole)) * 0.4
      : 0
    const shine = glint ? Math.max(0, dot(normal, halfway)) ** 28 * 0.6 : 0
    return (
      0.5 +
      (light - 0.5) * lightWeight +
      pattern +
      grain * TEXTURE +
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

// The painted orb as a data URL, cached per user, size and density.
export const orbAvatarUrl = (userId: string, size: number) =>
  ditheredUrl(`orb:${userId}`, () => orbAvatar(userId), size)

export const avatarInitials = (
  name: string | null | undefined,
  email: string | null | undefined,
  size: number
) => {
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
