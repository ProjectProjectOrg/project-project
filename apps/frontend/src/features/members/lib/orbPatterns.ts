import {
  add,
  between,
  chance,
  clamp,
  cross,
  dot,
  facing,
  fbm,
  normalize,
  onSphere,
  pick,
  type Random,
  scale,
  sharpen,
  smoothstep,
  valueNoise,
  type Vec
} from "./orbMath"

export type Surface = (p: Vec) => number

type Build = (next: Random, seed: number) => Surface

const frame = (pole: Vec) => {
  const side = normalize(
    cross(pole, Math.abs(pole[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])
  )
  const up = cross(pole, side)
  return {
    distance: (p: Vec) => Math.acos(clamp(dot(p, pole), -1, 1)),
    angle: (p: Vec) => Math.atan2(dot(p, up), dot(p, side))
  }
}

const warped = (next: Random, seed: number, strength: number): Surface => {
  const noise = fbm(valueNoise(seed), 3)
  const frequency = between(next, 1.2, 2.6)
  return (p) => (noise(scale(p, frequency)) - 0.5) * strength
}

const sites = (next: Random, count: number) =>
  Array.from({ length: count }, () => onSphere(next))

const nearest = (points: ReadonlyArray<Vec>, p: Vec) => {
  let first = 4
  let second = 4
  for (const point of points) {
    const d = 1 - dot(point, p)
    if (d < first) {
      second = first
      first = d
    } else if (d < second) second = d
  }
  return [Math.sqrt(first), Math.sqrt(second)] as const
}

const bands: Build = (next, seed) => {
  const frequency = between(next, 5, 14)
  const warp = warped(next, seed, between(next, 1.5, 5))
  const phase = next() * Math.PI * 2
  return (p) => Math.sin(p[1] * frequency + warp(p) + phase)
}

const pinstripe: Build = (next, seed) => {
  const direction = onSphere(next)
  const frequency = between(next, 16, 26)
  const warp = warped(next, seed, between(next, 0.5, 2))
  return (p) => sharpen(Math.sin(dot(p, direction) * frequency + warp(p)), 0.25)
}

const marble: Build = (next, seed) => {
  const direction = onSphere(next)
  const frequency = between(next, 3, 7)
  const warp = warped(next, seed, between(next, 6, 11))
  return (p) => Math.sin(dot(p, direction) * frequency + warp(p))
}

const swirl: Build = (next, seed) => {
  const pole = normalize(add(onSphere(next), [0, 0, 1.2]))
  const { distance, angle } = frame(pole)
  const frequency = between(next, 6, 14)
  const twist = pick(next, [-3, -2, -1, 1, 2, 3])
  const warp = warped(next, seed, between(next, 0.8, 2.5))
  return (p) => Math.sin(distance(p) * frequency + angle(p) * twist + warp(p))
}

const rings: Build = (next, seed) => {
  const { distance } = frame(normalize(add(onSphere(next), [0, 0, 1])))
  const frequency = between(next, 8, 18)
  const warp = warped(next, seed, between(next, 0.5, 3))
  return (p) => Math.sin(distance(p) * frequency + warp(p))
}

const spiral: Build = (next, seed) => {
  const { distance, angle } = frame(facing(next, 1.2))
  const arms = pick(next, [2, 2, 3, 4, 5])
  const tightness = between(next, 4, 9) * pick(next, [-1, 1])
  const warp = warped(next, seed, between(next, 0.3, 1.2))
  return (p) => {
    const d = distance(p)
    return (
      Math.sin(angle(p) * arms + Math.log(d + 0.08) * tightness + warp(p)) *
      smoothstep(0, 0.25, d)
    )
  }
}

const segments: Build = (next, seed) => {
  const { angle } = frame(onSphere(next))
  const count = pick(next, [3, 4, 5, 6, 8])
  const warp = warped(next, seed, between(next, 0, 0.6))
  return (p) => sharpen(Math.sin(angle(p) * count + warp(p)), 0.15)
}

const checker: Build = (next, seed) => {
  const { distance, angle } = frame(onSphere(next))
  const count = pick(next, [4, 6, 8])
  const frequency = between(next, 6, 10)
  const warp = warped(next, seed, between(next, 0, 0.8))
  return (p) =>
    sharpen(
      Math.sin(angle(p) * count + warp(p)) * Math.sin(distance(p) * frequency),
      0.2
    )
}

const continents: Build = (next, seed) => {
  const noise = fbm(valueNoise(seed), 4)
  const frequency = between(next, 1.6, 3.2)
  const sea = between(next, 0.42, 0.56)
  const terraces = chance(next, 0.5)
  return (p) => {
    const height = noise(scale(p, frequency)) - sea
    if (terraces) return clamp(Math.round(height * 14) / 3, -1, 1)
    return clamp(height * 9, -1, 1)
  }
}

const ridges: Build = (next, seed) => {
  const noise = fbm(valueNoise(seed), 4)
  const frequency = between(next, 2, 4)
  return (p) => {
    const ridge = 1 - Math.abs(noise(scale(p, frequency)) * 2 - 1)
    return ridge ** 3 * 2 - 0.6
  }
}

const lava: Build = (next, seed) => {
  const noise = fbm(valueNoise(seed), 3)
  const twist = fbm(valueNoise(seed + 1), 3)
  const frequency = between(next, 1.5, 3)
  const strength = between(next, 1.5, 3)
  return (p) => {
    const q = scale(p, frequency)
    const offset = (twist(q) - 0.5) * strength
    return clamp((noise(add(q, [offset, offset, offset])) - 0.5) * 5, -1, 1)
  }
}

const cells: Build = (next) => {
  const points = sites(next, Math.floor(between(next, 8, 22)))
  const invert = chance(next, 0.5) ? -1 : 1
  return (p) => {
    const [first] = nearest(points, p)
    return clamp(1 - first * 3.2, -1, 1) * invert
  }
}

const cracks: Build = (next) => {
  const points = sites(next, Math.floor(between(next, 10, 26)))
  const width = between(next, 0.05, 0.12)
  return (p) => {
    const [first, second] = nearest(points, p)
    return smoothstep(0, width, second - first) * 2 - 1
  }
}

const spots: Build = (next) => {
  const points = sites(next, Math.floor(between(next, 10, 40)))
  const radius = between(next, 0.18, 0.32)
  return (p) => {
    const [first] = nearest(points, p)
    return smoothstep(radius * 0.85, radius, first) * 2 - 1
  }
}

const storm: Build = (next, seed) => {
  const base = bands(next, seed)
  const eye = facing(next, 1.2)
  const { distance, angle } = frame(eye)
  const size = between(next, 0.25, 0.45)
  const turns = between(next, 6, 12) * pick(next, [-1, 1])
  return (p) => {
    const d = distance(p)
    const inside = 1 - smoothstep(size * 0.7, size, d)
    const vortex = Math.sin(d * turns * 3 + angle(p) * 2)
    return base(p) * (1 - inside) + vortex * inside
  }
}

const interference: Build = (next) => {
  const waves = Array.from({ length: 3 }, () => ({
    direction: onSphere(next),
    frequency: between(next, 6, 14)
  }))
  return (p) =>
    sharpen(
      waves.reduce(
        (total, wave) =>
          total + Math.sin(dot(p, wave.direction) * wave.frequency),
        0
      ) / 3,
      0.6
    )
}

export const PATTERN_NAMES = [
  "bands",
  "pinstripe",
  "marble",
  "swirl",
  "rings",
  "spiral",
  "segments",
  "checker",
  "continents",
  "ridges",
  "lava",
  "cells",
  "cracks",
  "spots",
  "storm",
  "interference"
] as const

export type Pattern = (typeof PATTERN_NAMES)[number]

export const PATTERNS: Readonly<Record<Pattern, Build>> = {
  bands,
  pinstripe,
  marble,
  swirl,
  rings,
  spiral,
  segments,
  checker,
  continents,
  ridges,
  lava,
  cells,
  cracks,
  spots,
  storm,
  interference
}
