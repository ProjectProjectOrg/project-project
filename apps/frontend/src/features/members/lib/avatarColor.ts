import { OUTER_RING, type ColorSwatch } from "@pp/shared"

const AVATAR_PALETTE: ReadonlyArray<ColorSwatch> = OUTER_RING.filter(
  (swatch, index) =>
    OUTER_RING.findIndex((other) => other.hex === swatch.hex) === index
)

const hashId = (id: string): number => {
  let hash = 0x811c9dc5
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export const avatarColor = (userId: string): ColorSwatch =>
  AVATAR_PALETTE[hashId(userId) % AVATAR_PALETTE.length]
