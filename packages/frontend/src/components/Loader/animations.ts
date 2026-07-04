export type Frame = { p: number; persp: number; falloff?: number }
export type Animation = (elapsedMs: number, persp: number) => Frame

const TAU = Math.PI * 2
const frac = (x: number) => x - Math.floor(x)

export const breathingP = (elapsedMs: number, periodMs: number) =>
  0.5 - 0.5 * Math.cos((TAU * elapsedMs) / periodMs)

const fold = (t: number) => breathingP(t, 4000)

const breathing: Animation = (t, persp) => ({ p: fold(t), persp })

const tilt: Animation = (t, persp) => ({
  p: fold(t),
  persp: persp + 0.16 * Math.sin((TAU * t) / 3500)
})

const sway: Animation = (t, persp) => ({
  p: fold(t),
  persp: persp + 0.24 * Math.sin((TAU * t) / 5200 + 1)
})

const gaze: Animation = (t, persp) => {
  const p = fold(t)
  return { p, persp: persp + 0.22 * (p - 0.5) * 2 }
}

const SWEEP_START = -1.2
const SWEEP_SPAN = 3.4
const SWEEP_FALLOFF = 0.5

const sweep: Animation = (t, persp) => ({
  p: SWEEP_START + frac(t / 6000) * SWEEP_SPAN,
  persp,
  falloff: SWEEP_FALLOFF
})

export const animations: { name: string; fn: Animation }[] = [
  { name: "breathing", fn: breathing },
  { name: "tilt", fn: tilt },
  { name: "sway", fn: sway },
  { name: "gaze", fn: gaze },
  { name: "sweep", fn: sweep }
]
