import type { Tag } from "@pp/shared"

const GRAY_SATURATION = 0.15

type Hsl = Readonly<{ hue: number; saturation: number; lightness: number }>

const toHsl = (hex: string): Hsl => {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const lightness = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { hue: 0, saturation: 0, lightness }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1))
  const sector =
    max === r
      ? ((g - b) / delta + 6) % 6
      : max === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4
  return { hue: sector * 60, saturation, lightness }
}

const colorRank = (hex: string) => {
  const { hue, saturation, lightness } = toHsl(hex)
  return saturation < GRAY_SATURATION
    ? ([1, lightness] as const)
    : ([0, hue] as const)
}

export const sortTagsByColor = <T extends Pick<Tag, "name" | "color">>(
  tags: ReadonlyArray<T>
): ReadonlyArray<T> =>
  tags.toSorted((a, b) => {
    const [groupA, keyA] = colorRank(a.color)
    const [groupB, keyB] = colorRank(b.color)
    return groupA - groupB || keyA - keyB || a.name.localeCompare(b.name)
  })
