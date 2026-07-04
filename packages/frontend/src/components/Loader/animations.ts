export type Frame = { p: number; persp: number }
export type Animation = (elapsedMs: number, persp: number) => Frame

const TAU = Math.PI * 2

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

export const animations: { name: string; fn: Animation }[] = [
  { name: "breathing", fn: breathing },
  { name: "tilt", fn: tilt },
  { name: "sway", fn: sway },
  { name: "gaze", fn: gaze }
]
