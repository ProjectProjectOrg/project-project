export type ColorSwatch = {
  readonly hue: number
  readonly L: number
  readonly C: number
  readonly oklch: string
  readonly hex: string
}

const INNER_HUES = Array.from({ length: 8 }, (_, i) => 22.5 + i * 45)
const OUTER_HUES = Array.from({ length: 13 }, (_, i) => 15 + i * 30)

const INNER = { L: 0.78, C: 0.07 }
const OUTER = { L: 0.7, C: 0.16 }

export const INNER_RING: ReadonlyArray<ColorSwatch> = INNER_HUES.map((h) =>
  swatch(h, INNER.L, INNER.C)
)

export const OUTER_RING: ReadonlyArray<ColorSwatch> = OUTER_HUES.map((h) =>
  swatch(h, OUTER.L, OUTER.C)
)

// The picker's colours, laid out as a honeycomb (ColorPicker): 12 strong
// colours (the outer ring without its repeat of the first hue), 6 soft ones
// on the hues where the honeycomb's inner ring meets them, and 4 neutrals.
export const STRONG_RING: ReadonlyArray<ColorSwatch> = OUTER_RING.slice(0, 12)

export const SOFT_RING: ReadonlyArray<ColorSwatch> = [
  45, 105, 165, 225, 285, 345
].map((h) => swatch(h, INNER.L, INNER.C))

export const NEUTRALS: ReadonlyArray<ColorSwatch> = [
  0.45, 0.66, 0.84, 0.98
].map((L) => swatch(0, L, 0))

// Every colour the picker offers.
export const TAG_COLOR_WHEEL: ReadonlyArray<ColorSwatch> = [
  ...SOFT_RING,
  ...STRONG_RING,
  ...NEUTRALS
]

// Every colour that may be stored: the picker's, plus the earlier soft ring
// (INNER_RING), which saved tags, statuses and templates may still use.
export const STORED_COLORS: ReadonlyArray<ColorSwatch> = [
  ...TAG_COLOR_WHEEL,
  ...INNER_RING
]

export const TAG_DEFAULT_PALETTE: ReadonlyArray<string> = OUTER_RING.map(
  (c) => c.hex
)

export const BASELINE_STATUS_COLORS: ReadonlyArray<string> = [
  "#a3a3a3",
  "#3b82f6",
  "#22c55e"
]

export function pickStatusColor(used: ReadonlyArray<string>) {
  for (const c of TAG_DEFAULT_PALETTE) if (!used.includes(c)) return c
  return TAG_DEFAULT_PALETTE[used.length % TAG_DEFAULT_PALETTE.length]
}

function swatch(hue: number, L: number, C: number) {
  return {
    hue,
    L,
    C,
    oklch: `oklch(${L} ${C} ${hue})`,
    hex: oklchToHex(L, C, hue)
  }
}

function oklchToHex(L: number, C: number, h: number) {
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

function channel(linear: number) {
  const clipped = Math.max(0, Math.min(1, linear))
  const srgb =
    clipped <= 0.0031308
      ? 12.92 * clipped
      : 1.055 * clipped ** (1 / 2.4) - 0.055
  return Math.round(Math.max(0, Math.min(1, srgb)) * 255)
    .toString(16)
    .padStart(2, "0")
}
