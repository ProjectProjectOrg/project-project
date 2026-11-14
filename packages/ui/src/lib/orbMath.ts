export type Vec = readonly [number, number, number]

export type Random = () => number

export type Noise = (p: Vec) => number

export const random = (seed: number): Random => {
  let state = seed | 0
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <A>(next: Random, list: ReadonlyArray<A>): A =>
  list[Math.floor(next() * list.length)]

export const between = (next: Random, low: number, high: number) =>
  low + next() * (high - low)

export const chance = (next: Random, probability: number) =>
  next() < probability

export const clamp = (value: number, low = 0, high = 1) =>
  Math.max(low, Math.min(high, value))

export const smoothstep = (low: number, high: number, value: number) => {
  const t = clamp((value - low) / (high - low))
  return t * t * (3 - 2 * t)
}

export const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

export const scale = (a: Vec, amount: number): Vec => [
  a[0] * amount,
  a[1] * amount,
  a[2] * amount
]

export const add = (a: Vec, b: Vec): Vec => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2]
]

export const cross = (a: Vec, b: Vec): Vec => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]

export const normalize = (a: Vec): Vec => scale(a, 1 / (Math.hypot(...a) || 1))

export const onSphere = (next: Random): Vec => {
  const z = next() * 2 - 1
  const angle = next() * Math.PI * 2
  const radius = Math.sqrt(1 - z * z)
  return [Math.cos(angle) * radius, Math.sin(angle) * radius, z]
}

export const facing = (next: Random, spread: number): Vec =>
  normalize([(next() - 0.5) * spread, (next() - 0.5) * spread, 1])

const lattice = (seed: number, x: number, y: number, z: number) => {
  let h =
    seed ^
    Math.imul(x, 0x27d4eb2d) ^
    Math.imul(y, 0x165667b1) ^
    Math.imul(z, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const ease = (t: number) => t * t * (3 - 2 * t)

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export const valueNoise =
  (seed: number): Noise =>
  ([x, y, z]) => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const xf = ease(x - xi)
    const yf = ease(y - yi)
    const zf = ease(z - zi)
    const at = (dx: number, dy: number, dz: number) =>
      lattice(seed, xi + dx, yi + dy, zi + dz)
    return lerp(
      lerp(
        lerp(at(0, 0, 0), at(1, 0, 0), xf),
        lerp(at(0, 1, 0), at(1, 1, 0), xf),
        yf
      ),
      lerp(
        lerp(at(0, 0, 1), at(1, 0, 1), xf),
        lerp(at(0, 1, 1), at(1, 1, 1), xf),
        yf
      ),
      zf
    )
  }

export const fbm =
  (noise: Noise, octaves: number): Noise =>
  (p) => {
    let total = 0
    let weight = 0
    for (let octave = 0; octave < octaves; octave++) {
      const amplitude = 0.5 ** octave
      total += noise(scale(p, 2 ** octave)) * amplitude
      weight += amplitude
    }
    return total / weight
  }

export const sharpen = (value: number, amount: number) =>
  Math.sign(value) * Math.abs(value) ** amount
