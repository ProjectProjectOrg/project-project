import { clamp } from "./orbMath"

export type Oklch = Readonly<{ L: number; C: number; h: number }>

// An OKLCH colour as CSS, with lightness and chroma kept in range and the
// hue wrapped onto the wheel.
export const oklchCss = ({ L, C, h }: Oklch, opacity = 1) =>
  `oklch(${clamp(L).toFixed(3)} ${Math.max(0, C).toFixed(3)} ${((h % 360) + 360) % 360}${opacity < 1 ? ` / ${opacity}` : ""})`

// sRGB hex to OKLCH (Björn Ottosson's matrices).
const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

export const hexToOklch = (hex: string) => {
  const value = Number.parseInt(hex.replace("#", ""), 16)
  const r = toLinear(((value >> 16) & 255) / 255)
  const g = toLinear(((value >> 8) & 255) / 255)
  const b = toLinear((value & 255) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const h = (Math.atan2(B, A) * 180) / Math.PI
  return { L, C: Math.hypot(A, B), h: h < 0 ? h + 360 : h }
}
