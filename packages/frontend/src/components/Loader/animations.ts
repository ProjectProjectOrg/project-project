export type Frame = { p: number; shift: [number, number] }
export type Animation = (elapsedMs: number) => Frame

const TAU = Math.PI * 2
const frac = (x: number) => x - Math.floor(x)
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (x: number) => x * x * (3 - 2 * x)
const triangle = (x: number) => {
  const f = frac(x)
  return f < 0.5 ? 2 * f : 2 * (1 - f)
}
const still: [number, number] = [0, 0]

export const breathingP = (elapsedMs: number, periodMs: number) =>
  0.5 - 0.5 * Math.cos((TAU * elapsedMs) / periodMs)

const breathing: Animation = (t) => ({ p: breathingP(t, 4000), shift: still })

const sweep: Animation = (t) => ({ p: triangle(t / 3000), shift: still })

const snap: Animation = (t) => {
  const f = frac(t / 3200)
  const move = 0.42
  const hold = 0.08
  let p: number
  if (f < move) p = smooth(f / move)
  else if (f < move + hold) p = 1
  else if (f < move + hold + move) p = 1 - smooth((f - move - hold) / move)
  else p = 0
  return { p, shift: still }
}

const pulse: Animation = (t) => {
  const f = frac(t / 2000)
  const bump = (x: number) => Math.sin(Math.PI * clamp01(x))
  let e = 0
  if (f < 0.18) e = bump(f / 0.18)
  else if (f < 0.36) e = bump((f - 0.18) / 0.18) * 0.7
  return { p: 0.5 + 0.45 * e, shift: still }
}

const flutter: Animation = (t) => {
  const base = breathingP(t, 5000)
  const wobble = 0.05 * Math.sin((TAU * t) / 320)
  return { p: clamp01(base + wobble), shift: still }
}

const drift: Animation = (t) => ({
  p: breathingP(t, 6000),
  shift: [frac(t / 2600) * 2, frac(t / 3400) * 2]
})

const scan: Animation = (t) => ({
  p: 0.5,
  shift: [frac(t / 1800) * 2, 0]
})

export const animations: { name: string; fn: Animation }[] = [
  { name: "breathing", fn: breathing },
  { name: "sweep", fn: sweep },
  { name: "snap", fn: snap },
  { name: "pulse", fn: pulse },
  { name: "flutter", fn: flutter },
  { name: "drift", fn: drift },
  { name: "scan", fn: scan }
]
