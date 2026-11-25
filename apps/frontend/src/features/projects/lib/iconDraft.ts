import type { AttachmentId, ProjectIconImage } from "@pp/shared"
import * as Data from "effect/Data"
import * as Predicate from "effect/Predicate"

import type { IconSource } from "@/features/projects/forms/project-icon/opts"
import {
  analyzeCutout,
  hasAlpha,
  CUTOUT_PREVIEW_EDGE,
  type RgbaImage
} from "@/features/projects/lib/iconCutout"
import { objectUrl } from "@/lib/objectUrl"

import { compressImage } from "./imageCompression"

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

export type IconDraftValues = Readonly<{
  source: Pick<typeof IconSource.Type, "_tag" | "emoji">
  crop: IconCrop
  treatment: Readonly<{
    kind: IconTreatment
    tolerance: number
  }>
}>

export const appliedIconTreatment = (
  iconImage: ProjectIconImage | null,
  fallbackTolerance: number
) =>
  ({
    kind: iconImage?.type === "full_bleed" ? "full_bleed" : "sticker",
    tolerance:
      iconImage?.type === "sticker" && iconImage.cutoutTolerance !== null
        ? iconImage.cutoutTolerance
        : fallbackTolerance
  }) satisfies IconDraftValues["treatment"]

export const iconPreviewChanged = (
  values: IconDraftValues,
  applied: {
    readonly icon: string
    readonly iconImage: ProjectIconImage | null
  },
  pickedNewFile: boolean,
  fallbackTolerance: number
) => {
  if (Predicate.isTagged(values.source, "emoji"))
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

export const resolveIconTreatment = (classification: IconClassification) =>
  classification.treatment === "full_bleed" || !classification.clean
    ? ("full_bleed" as const)
    : ("sticker" as const)

export const buildIconImage = (input: {
  readonly classification: IconClassification
  readonly sourceAttachmentId: AttachmentId
  readonly renderedAttachmentId: AttachmentId
  readonly crop: IconCrop
}) => {
  if (resolveIconTreatment(input.classification) === "full_bleed") {
    return {
      type: "full_bleed",
      sourceAttachmentId: input.sourceAttachmentId,
      crop: input.crop
    } satisfies ProjectIconImage
  }
  return {
    type: "sticker",
    sourceAttachmentId: input.sourceAttachmentId,
    renderedAttachmentId: input.renderedAttachmentId,
    cutoutTolerance: input.classification.transparent
      ? null
      : input.classification.tolerance,
    crop: input.crop
  } satisfies ProjectIconImage
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
) => {
  if (checks.every((check) => check.passed)) return null
  return checks.some((check) => check.id === "minSize" && !check.passed)
    ? ("too_small" as const)
    : ("background" as const)
}

export const compositeToBlob = (
  source: RgbaImage,
  alpha: Uint8ClampedArray | null
) => {
  const canvas = document.createElement("canvas")
  canvas.width = source.width
  canvas.height = source.height
  const ctx = canvas.getContext("2d")!
  const out = ctx.createImageData(source.width, source.height)
  out.data.set(source.data)
  if (alpha)
    for (let p = 0; p < alpha.length; p++) out.data[p * 4 + 3] = alpha[p]
  ctx.putImageData(out, 0, 0)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob failed"))),
      "image/png"
    )
  )
}

export async function prepareIconFiles(
  bitmap: ImageBitmap,
  file: File,
  treatment: IconDraftValues["treatment"]
) {
  const { source, alpha, clean } = analyseAt(
    bitmap,
    CUTOUT_APPLY_MAX_EDGE,
    treatment.tolerance
  )
  const transparent = hasAlpha(source)
  const wantsSticker = treatment.kind === "sticker"
  if (wantsSticker && !clean) return null
  const compressed = await compressImage(file, {
    maxEdge: 1024,
    hasAlpha: transparent,
    quality: 0.85
  })
  const rendered = wantsSticker
    ? transparent
      ? file
      : new File([await compositeToBlob(source, alpha)], "icon.png", {
          type: "image/png"
        })
    : null
  return {
    compressed,
    rendered,
    classification: {
      treatment: treatment.kind,
      clean,
      transparent,
      tolerance: treatment.tolerance
    }
  }
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
  const full = objectUrl(fullBlob)
  try {
    const cutout = transparent ? full : objectUrl(cutoutBlob)
    return {
      cutoutUrl: cutout.url,
      fullUrl: full.url,
      release: () => {
        if (cutout !== full) cutout.release()
        full.release()
      },
      clean,
      reason,
      transparent,
      treatment
    }
  } catch (error) {
    full.release()
    throw error
  }
}

export type LiveIcon = Data.TaggedEnum<{
  emoji: Readonly<{ emoji: string }>
  image: Readonly<{
    src: string
    crop: IconCrop
    treatment: IconTreatment
  }>
}>
export const LiveIcon = Data.taggedEnum<LiveIcon>()

export type LiveImageIcon = Data.TaggedEnum.Value<LiveIcon, "image">
