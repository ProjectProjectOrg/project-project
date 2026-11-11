import type { LinkPreview } from "@pp/shared"
import sharp from "sharp"

export async function faviconRendering(
  bytes: Uint8Array
): Promise<LinkPreview["faviconRendering"]> {
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: 1024 * 1024 })
      .resize({
        width: 32,
        height: 32,
        fit: "inside",
        withoutEnlargement: true
      })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .timeout({ seconds: 1 })
      .toBuffer({ resolveWithObject: true })
    let transparent = 0
    let foreground = 0
    let minimum = 255
    let maximum = 0
    for (let offset = 0; offset < data.length; offset += 4) {
      const alpha = data[offset + 3]
      if (alpha <= 16) {
        transparent++
        continue
      }
      const red = data[offset]
      const green = data[offset + 1]
      const blue = data[offset + 2]
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 16)
        return "original"
      minimum = Math.min(minimum, red, green, blue)
      maximum = Math.max(maximum, red, green, blue)
      if (maximum - minimum > 24) return "original"
      if (alpha >= 128) foreground++
    }
    return transparent >= info.width * info.height * 0.05 && foreground >= 4
      ? "monochrome"
      : "original"
  } catch {
    return "original"
  }
}
