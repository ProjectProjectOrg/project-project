import { avatarColor, hashId } from "./avatarColor"
import { ditheredUrl, type DitherScene } from "./ditherPaint"
import {
  ditherPalette,
  paletteBase,
  pickedPalette,
  type PaletteTone
} from "./ditherPalette"
import { between, chance, normalize, pick, random, type Vec } from "./orbMath"
import { mottle, pickPattern } from "./orbPatterns"

/*
 * A project's generated tile, the square sibling of the member orbs
 * (orbAvatar): one seed (the project's id) picks a surface pattern, a light
 * direction and a texture, and the project's colour sets the palette (lib/
 * ditherPalette, translucent like the orbs, in one hue, three or grey). It
 * is painted through the same 4×4 ordered dither, so tiles and avatars read
 * as one family.
 */

// Light runs across the tile from one side or corner; flat tiles have none.
type Light = "diagonal" | "side" | "flat"
const LIGHTS: ReadonlyArray<Light> = ["diagonal", "diagonal", "side", "flat"]
const LIGHT_WEIGHT: Readonly<Record<Light, number>> = {
  diagonal: 0.6,
  side: 0.45,
  flat: 0
}

export type ProjectTile = DitherScene

// Multicolour isn't the project's colour: like a member orb, its hues come
// from the seed alone, so the picked accent plays no part in it.
const tileBase = (seed: string, color: string, tone: PaletteTone) => {
  if (tone !== "multi") return paletteBase(color)
  const { L, C, hue } = avatarColor(seed)
  return { L, C, h: hue }
}

export const projectTile = (
  seed: string,
  color: string,
  tone: PaletteTone = "mono",
  // Multicolour's picked colours; none means seeded ones.
  picks: ReadonlyArray<string> = []
) => {
  const next = random(hashId(`${seed}:tile`))
  const noiseSeed = hashId(`${seed}:noise`)
  const { name: patternName, surface: pattern } = pickPattern(next, noiseSeed)
  const amplitude = between(next, 0.18, 0.34)
  const zoom = between(next, 0.7, 1.6)
  const light = pick(next, LIGHTS)
  const angle = next() * Math.PI * 2
  const lightX = Math.cos(angle)
  const lightY = Math.sin(angle)
  const lightWeight = LIGHT_WEIGHT[light]
  const texture = mottle(noiseSeed)
  const roughness = between(next, 0.1, 0.6)
  const glow = chance(next, 0.3)
    ? { x: between(next, 0.2, 0.8), y: between(next, 0.2, 0.8) }
    : null

  const field = (u: number, v: number) => {
    const x = (u - 0.5) * 2
    const y = (v - 0.5) * 2
    // The plane, bent onto a shallow dome so the sphere patterns read.
    const p: Vec = normalize([x * zoom, y * zoom, 1.6])
    const ramp = (x * lightX + y * lightY) * -0.5
    const lit = light === "diagonal" ? ramp : ramp * 0.8
    const halo = glow
      ? Math.max(0, 1 - Math.hypot(u - glow.x, v - glow.y) * 2.2) * 0.25
      : 0
    return (
      0.5 +
      lit * lightWeight +
      pattern(p) * amplitude +
      (texture(p) - 0.5) * 0.35 * roughness +
      halo
    )
  }

  const traits = [patternName, `${light} light`, ...(glow ? ["glow"] : [])]
  const palette =
    tone === "multi" && picks.length > 0
      ? pickedPalette(picks.map(paletteBase))
      : ditherPalette(
          random(hashId(`${seed}:colours`)),
          tileBase(seed, color, tone),
          tone
        ).palette
  return { palette, field, traits }
}

// What a tile's colours depend on, for the cache.
const colourKey = (
  color: string,
  tone: PaletteTone,
  picks: ReadonlyArray<string>
) => (tone === "multi" ? `multi:${picks.join(",")}` : `${color}:${tone}`)

// The painted tile as a data URL, cached per seed, colours, size and density.
export const projectTileUrl = (
  seed: string,
  color: string,
  size: number,
  tone: PaletteTone = "mono",
  picks: ReadonlyArray<string> = []
) =>
  ditheredUrl(
    `tile:${seed}:${colourKey(color, tone, picks)}`,
    () => projectTile(seed, color, tone, picks),
    size
  )
