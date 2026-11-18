import { STORED_COLORS } from "@pp/shared"

import { hexToOklch, oklchCss, type Oklch } from "./oklch"
import { pick, type Random } from "./orbMath"

/*
 * The colours of a generated orb or tile: five translucent steps, from a
 * deep shade to the base colour, so the page shows through and the dither
 * reads light. "multi" (the member orbs) turns the deep and middle steps to
 * two other seeded hues on the wheel; "mono" keeps every step on the base
 * hue; "gray" drops the chroma.
 */

export type PaletteTone = "mono" | "multi" | "gray"

export type DitherPalette = Readonly<{
  palette: ReadonlyArray<string>
  // Text on the orb, for each theme.
  ink: Readonly<{ light: string; dark: string }>
}>

const ACCENT_SHIFTS: ReadonlyArray<number> = [90, 120, 150, 180, 210, 240]
const DEEP_SHIFTS: ReadonlyArray<number> = [60, 90, 120, 240, 270]
const INK_LIGHT = { L: 0.3, C: 0.1 }
const INK_DARK = { L: 0.97, C: 0.025 }

export const ditherPalette = (
  next: Random,
  base: Oklch,
  tone: PaletteTone
): DitherPalette => {
  // Drawn for every tone, so a seed's pattern doesn't change with its tone.
  const accentHue = (base.h + pick(next, ACCENT_SHIFTS)) % 360
  const deepPick = (accentHue + pick(next, DEEP_SHIFTS)) % 360
  const deepHue = deepPick === base.h % 360 ? deepPick + 30 : deepPick
  const multi = tone === "multi"
  const chroma = tone === "gray" ? 0 : 1
  const step = (h: number, opacity: number) =>
    oklchCss({ L: base.L, C: base.C * chroma, h }, opacity)
  const accent = multi ? accentHue : base.h
  return {
    palette: [
      step(multi ? deepHue : base.h, 0.5),
      step(accent, 0.56),
      step(accent, 0.4),
      step(base.h, 0.34),
      step(base.h, 0.2)
    ],
    ink: {
      light: oklchCss({ L: INK_LIGHT.L, C: INK_LIGHT.C * chroma, h: accent }),
      dark: oklchCss({ L: INK_DARK.L, C: INK_DARK.C * chroma, h: accent })
    }
  }
}

// The palette from picked colours (a project's Multicolour picks): the
// first is the base, the second the middle steps, the third the deep step;
// with fewer, the earlier ones fill in. Same translucent steps as above.
export const pickedPalette = (
  picks: ReadonlyArray<Oklch>
): ReadonlyArray<string> => {
  const [base, accent = base, deep = accent] = picks
  const step = (color: Oklch, opacity: number) => oklchCss(color, opacity)
  return [
    step(deep, 0.5),
    step(accent, 0.56),
    step(accent, 0.4),
    step(base, 0.34),
    step(base, 0.2)
  ]
}

// A colour as the palette's base: a wheel colour (what projects and members
// get) exactly as the wheel defines it, any other hex converted.
export const paletteBase = (hex: string): Oklch => {
  const swatch = STORED_COLORS.find(
    (ring) => ring.hex.toLowerCase() === hex.toLowerCase()
  )
  return swatch ? { L: swatch.L, C: swatch.C, h: swatch.hue } : hexToOklch(hex)
}
