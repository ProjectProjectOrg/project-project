import type { AttachmentId, ProjectIconImage } from "@projectproject/shared"
import {
  analyzeCutout,
  hasAlpha,
  CUTOUT_PREVIEW_EDGE,
  type RgbaImage
} from "@/lib/iconCutout"

export type IconTreatment = "sticker" | "full_bleed"

export type IconClassification = {
  readonly treatment: IconTreatment
  readonly clean: boolean
  readonly transparent: boolean
  readonly tolerance: number
}

export type CutoutRejection = "too_small" | "background"

export type IconCrop = {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

export const CUTOUT_APPLY_MAX_EDGE = 512

export type IconDraftValues = {
  readonly source: { readonly kind: "emoji" | "image"; readonly emoji: string }
  readonly crop: IconCrop
  readonly treatment: {
    readonly kind: IconTreatment
    readonly tolerance: number
  }
}

export const appliedIconTreatment = (
  iconImage: ProjectIconImage | null,
  fallbackTolerance: number
): { readonly kind: IconTreatment; readonly tolerance: number } => ({
  kind: iconImage?.type === "full_bleed" ? "full_bleed" : "sticker",
  tolerance:
    iconImage?.type === "sticker" && iconImage.cutoutTolerance !== null
      ? iconImage.cutoutTolerance
      : fallbackTolerance
})

export const iconPreviewChanged = (
  values: IconDraftValues,
  applied: {
    readonly icon: string
    readonly iconImage: ProjectIconImage | null
  },
  pickedNewFile: boolean,
  fallbackTolerance: number
): boolean => {
  if (values.source.kind === "emoji")
    return applied.iconImage !== null || values.source.emoji !== applied.icon
  if (applied.iconImage === null || pickedNewFile) return true
  const treatment = appliedIconTreatment(applied.iconImage, fallbackTolerance)
  return (
    values.crop.x !== applied.iconImage.crop.x ||
    values.crop.y !== applied.iconImage.crop.y ||
    values.crop.zoom !== applied.iconImage.crop.zoom ||
    values.treatment.kind !== treatment.kind ||
    values.treatment.tolerance !== treatment.tolerance
  )
}

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
  if (hasAlpha(source))
    return { source, alpha: null, clean: true, reason: null }
  const result = analyzeCutout(source, { tolerance })
  return {
    source,
    alpha: result.alpha,
    clean: result.clean,
    reason: rejectionReason(result.checks)
  }
}

const rejectionReason = (
  checks: ReadonlyArray<{ readonly id: string; readonly passed: boolean }>
): CutoutRejection | null => {
  if (checks.every((check) => check.passed)) return null
  return checks.some((check) => check.id === "minSize" && !check.passed)
    ? "too_small"
    : "background"
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
  const { source, alpha, clean, reason } = analyseAt(
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
  const fullBlob = await compositeToBlob(source, null)
  const cutoutBlob = transparent
    ? fullBlob
    : await compositeToBlob(source, alpha)
  const full = URL.createObjectURL(fullBlob)
  const cutout = transparent ? full : URL.createObjectURL(cutoutBlob)
  return {
    cutoutUrl: cutout,
    fullUrl: full,
    clean,
    reason,
    transparent,
    treatment
  }
}
