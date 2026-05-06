export type ColorSwatch = {
  readonly hue: number
  readonly L: number
  readonly C: number
  readonly oklch: string
  readonly hex: string
}

const INNER_HUES = Array.from({ length: 12 }, (_, i) => 30 + i * 30)
const OUTER_HUES = Array.from({ length: 18 }, (_, i) => 20 + i * 20)

const INNER = { L: 0.78, C: 0.07 }
const OUTER = { L: 0.7, C: 0.16 }

export const INNER_RING: ReadonlyArray<ColorSwatch> = INNER_HUES.map((h) =>
  swatch(h, INNER.L, INNER.C)
)

export const OUTER_RING: ReadonlyArray<ColorSwatch> = OUTER_HUES.map((h) =>
  swatch(h, OUTER.L, OUTER.C)
)

export const TAG_COLOR_WHEEL: ReadonlyArray<ColorSwatch> = [
  ...INNER_RING,
  ...OUTER_RING
]

export const TAG_DEFAULT_PALETTE: ReadonlyArray<string> = OUTER_RING.map(
  (c) => c.hex
)

function swatch(hue: number, L: number, C: number): ColorSwatch {
  return {
    hue,
    L,
    C,
    oklch: `oklch(${L} ${C} ${hue})`,
    hex: oklchToHex(L, C, hue)
  }
}

function oklchToHex(L: number, C: number, h: number): string {
  const hRad = (h * Math.PI) / 180
  const a = C * Math.cos(hRad)
  const b = C * Math.sin(hRad)

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b

  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s

  return `#${channel(r)}${channel(g)}${channel(bl)}`
}

function channel(linear: number): string {
  const clipped = Math.max(0, Math.min(1, linear))
  const srgb =
    clipped <= 0.0031308
      ? 12.92 * clipped
      : 1.055 * clipped ** (1 / 2.4) - 0.055
  return Math.round(Math.max(0, Math.min(1, srgb)) * 255)
    .toString(16)
    .padStart(2, "0")
}
