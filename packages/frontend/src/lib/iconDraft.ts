import type { AttachmentId, ProjectIconImage } from "@projectproject/shared"
import {
  analyzeCutout,
  hasAlpha,
  CUTOUT_PREVIEW_EDGE,
  type RgbaImage
} from "@/lib/iconCutout"

export type IconTreatment = "sticker" | "full_bleed"

export interface IconClassification {
  readonly treatment: IconTreatment
  readonly clean: boolean
  readonly transparent: boolean
  readonly tolerance: number
}

export interface IconCrop {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export const CUTOUT_APPLY_MAX_EDGE = 512

export const resolveIconTreatment = (
  classification: IconClassification
): IconTreatment =>
  classification.treatment === "full_bleed" || !classification.clean
    ? "full_bleed"
    : "sticker"

export const buildIconImage = (input: {
  readonly classification: IconClassification
  readonly sourceAttachmentId: AttachmentId
  readonly renderedAttachmentId: AttachmentId
  readonly crop: IconCrop
}): ProjectIconImage => {
  if (resolveIconTreatment(input.classification) === "full_bleed") {
    return {
      type: "full_bleed",
      sourceAttachmentId: input.sourceAttachmentId,
      crop: input.crop
    }
  }
  return {
    type: "sticker",
    sourceAttachmentId: input.sourceAttachmentId,
    renderedAttachmentId: input.renderedAttachmentId,
    cutoutTolerance: input.classification.transparent
      ? null
      : input.classification.tolerance,
    crop: input.crop
  }
}

export const analyseAt = (
  bitmap: ImageBitmap,
  edge: number,
  tolerance: number
) => {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0, width, height)
  const image = ctx.getImageData(0, 0, width, height)
  const source: RgbaImage = { data: image.data, width, height }
  if (hasAlpha(source)) return { source, alpha: null, clean: true }
  const result = analyzeCutout(source, { tolerance })
  return { source, alpha: result.alpha, clean: result.clean }
}

export const compositeToBlob = (
  source: RgbaImage,
  alpha: Uint8ClampedArray | null
): Promise<Blob> => {
  const canvas = document.createElement("canvas")
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext("2d")!
  const out = ctx.createImageData(source.width, source.height)
  out.data.set(source.data)
  if (alpha)
    for (let p = 0; p < alpha.length; p++) out.data[p * 4 + 3] = alpha[p]
  ctx.putImageData(out, 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png"
    )
  )
}

export const buildDraftPreview = async (
  bitmap: ImageBitmap,
  requestedTreatment: IconTreatment,
  tolerance: number
) => {
  const { source, alpha, clean } = analyseAt(
    bitmap,
    CUTOUT_PREVIEW_EDGE,
    tolerance
  )
  const transparent = hasAlpha(source)
  const treatment = resolveIconTreatment({
    treatment: requestedTreatment,
    clean,
    transparent,
    tolerance
  })
  const blob = await compositeToBlob(
    source,
    treatment === "sticker" && !transparent ? alpha : null
  )
  return {
    url: URL.createObjectURL(blob),
    clean,
    transparent,
    treatment
  }
}
