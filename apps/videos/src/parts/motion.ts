import { interpolate, spring, type SpringConfig } from "remotion"

// Frame-driven motion helpers. Remotion renders frame by frame, so every
// value here is a pure function of the frame: no CSS transitions.

const FPS = 30

const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp"
} as const

// A linear 0..1 over [from, to], clamped.
export const progress = (frame: number, from: number, to: number) =>
  interpolate(frame, [from, to], [0, 1], CLAMP)

// Maps a 0..1 value onto [from, to], clamped.
export const mix = (value: number, from: number, to: number) =>
  from + (to - from) * value

// Snappy, with a little overshoot: the house spring for things landing.
export const LAND: Partial<SpringConfig> = { damping: 14, stiffness: 170 }
// Calmer, no overshoot: for exits and moves.
export const GLIDE: Partial<SpringConfig> = {
  damping: 200,
  stiffness: 120
}
// Bouncy, for pops.
export const POP: Partial<SpringConfig> = { damping: 10, stiffness: 220 }

export const springAt = (
  frame: number,
  start: number,
  config: Partial<SpringConfig> = LAND,
  durationInFrames?: number
) => spring({ frame: frame - start, fps: FPS, config, durationInFrames })

// A quick press: down to `depth` and back, over `length` frames.
export const press = (
  frame: number,
  start: number,
  depth = 0.94,
  length = 8
) => {
  const down = progress(frame, start, start + length * 0.35)
  const up = springAt(frame, start + length * 0.35, POP)
  return 1 - (1 - depth) * (down - up * down)
}
