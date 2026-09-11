import sharp from "sharp"
import {
  BANNER_PLACEHOLDER_BUDGET,
  BANNER_PLACEHOLDER_MAX_LENGTH,
  type ProjectBanner
} from "@projectproject/shared"

export const BANNER_PLACEHOLDER_EDGE = 24

export const BANNER_PLACEHOLDER_QUALITY_LADDER = [50, 35, 20, 10] as const

export type AttachmentBanner = Extract<ProjectBanner, { type: "attachment" }>

export const bannerNeedsPlaceholder = (
  banner: ProjectBanner | null | undefined
): banner is AttachmentBanner =>
  banner?.type === "attachment" && (banner.placeholder ?? null) === null

export const encodeBannerPlaceholder = async (
  bytes: Uint8Array
): Promise<string | null> => {
  let smallest: string | null = null
  for (const quality of BANNER_PLACEHOLDER_QUALITY_LADDER) {
    const encoded = await sharp(bytes)
      .resize({
        width: BANNER_PLACEHOLDER_EDGE,
        height: BANNER_PLACEHOLDER_EDGE,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality })
      .toBuffer()
    smallest = `data:image/webp;base64,${encoded.toString("base64")}`
    if (smallest.length <= BANNER_PLACEHOLDER_BUDGET) return smallest
  }
  return smallest !== null && smallest.length <= BANNER_PLACEHOLDER_MAX_LENGTH
    ? smallest
    : null
}
