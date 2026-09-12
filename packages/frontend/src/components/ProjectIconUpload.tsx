import { useEffect, useRef, useState } from "react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Exit from "effect/Exit"
import {
  ATTACHMENT_MAX_BYTES,
  isProjectIconContentType,
  PROJECT_ICON_CONTENT_TYPES,
  type AttachmentId,
  type ProjectIconImage
} from "@projectproject/shared"
import { uploadProjectImageAtom } from "@/atoms/attachments"
import { projectKey, updateProjectAtom } from "@/atoms/projects"
import { orgStorageAtom } from "@/atoms/storage"
import {
  compressImage,
  type CompressImageOptions
} from "@/lib/imageCompression"
import { Button } from "@/components/ui/button"
import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"
import {
  analyzeCutout,
  hasAlpha,
  CUTOUT_DEFAULT_TOLERANCE,
  CUTOUT_MAX_TOLERANCE,
  CUTOUT_PREVIEW_EDGE,
  type RgbaImage
} from "@/lib/iconCutout"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { Trash2, Upload } from "lucide-react"

export type IconTreatment = "sticker" | "full_bleed"

export type IconClassification = {
  readonly treatment: IconTreatment
  readonly clean: boolean
  readonly transparent: boolean
  readonly tolerance: number
}

export type IconCrop = {
  readonly x: number
  readonly y: number
  readonly zoom: number
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

const ICON_CROP: IconCrop = { x: 0.5, y: 0.5, zoom: 1 }
const CUTOUT_APPLY_MAX_EDGE = 512

const analyseAt = (bitmap: ImageBitmap, edge: number, tolerance: number) => {
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

const compositeToBlob = (
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

type CutoutRejection = "too_small" | "background"

type Draft = {
  readonly file: File
  readonly bitmap: ImageBitmap
  readonly treatment: IconTreatment
  readonly clean: boolean
  readonly reason: CutoutRejection | null
  readonly transparent: boolean
  readonly tolerance: number
  readonly previewUrl: string
}

const buildDraftPreview = async (
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
  const blob = await compositeToBlob(
    source,
    treatment === "sticker" && !transparent ? alpha : null
  )
  return {
    url: URL.createObjectURL(blob),
    clean,
    reason,
    transparent,
    treatment
  }
}

export function ProjectIconUpload({
  orgSlug,
  slug,
  iconImage
}: {
  orgSlug: string
  slug: string
  iconImage: ProjectIconImage | null
}) {
  const key = projectKey(orgSlug, slug)
  const update = useAtomSet(updateProjectAtom(key), { mode: "promiseExit" })
  const upload = useAtomSet(uploadProjectImageAtom(key), {
    mode: "promiseExit"
  })
  const updateState = useAtomValue(updateProjectAtom(key))
  const uploadState = useAtomValue(uploadProjectImageAtom(key))
  const storage = useAtomValue(orgStorageAtom(orgSlug))
  const storageAvailable =
    AsyncResult.isSuccess(storage) && storage.value.status === "active"
  const submitting = updateState.waiting || uploadState.waiting

  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState(false)
  const objectUrls = useRef<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const restyleToken = useRef(0)
  const pendingTolerance = useRef<number | null>(null)
  const toleranceFrame = useRef<number | null>(null)

  const liveBitmap = useRef<ImageBitmap | null>(null)

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
      liveBitmap.current?.close()
      liveBitmap.current = null
    },
    []
  )

  const cancelPendingTolerance = () => {
    if (toleranceFrame.current !== null) {
      cancelAnimationFrame(toleranceFrame.current)
      toleranceFrame.current = null
    }
    pendingTolerance.current = null
  }

  useEffect(() => cancelPendingTolerance, [])

  const closeDraft = () => {
    restyleToken.current++
    cancelPendingTolerance()
    if (draft) URL.revokeObjectURL(draft.previewUrl)
    liveBitmap.current?.close()
    liveBitmap.current = null
    setDraft(null)
    setError(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  const onFileSelected = async (file: File) => {
    if (fileRef.current) fileRef.current.value = ""
    if (
      !isProjectIconContentType(file.type) ||
      file.size > ATTACHMENT_MAX_BYTES ||
      file.size === 0
    ) {
      setError(true)
      return
    }
    setError(false)
    const token = ++restyleToken.current
    cancelPendingTolerance()
    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(file)
      if (token !== restyleToken.current) {
        bitmap.close()
        return
      }
      const preview = await buildDraftPreview(
        bitmap,
        "sticker",
        CUTOUT_DEFAULT_TOLERANCE
      )
      if (token !== restyleToken.current) {
        bitmap.close()
        URL.revokeObjectURL(preview.url)
        return
      }
      liveBitmap.current?.close()
      liveBitmap.current = bitmap
      objectUrls.current.push(preview.url)
      setDraft({
        file,
        bitmap,
        treatment: preview.treatment,
        clean: preview.clean,
        reason: preview.reason,
        transparent: preview.transparent,
        tolerance: CUTOUT_DEFAULT_TOLERANCE,
        previewUrl: preview.url
      })
    } catch {
      bitmap?.close()
      setError(true)
    }
  }

  const restyle = async (
    treatment: IconTreatment,
    tolerance: number,
    cleanOverride?: boolean,
    reasonOverride?: CutoutRejection
  ) => {
    if (!draft) return
    const token = ++restyleToken.current
    const preview = await buildDraftPreview(draft.bitmap, treatment, tolerance)
    if (token !== restyleToken.current) {
      URL.revokeObjectURL(preview.url)
      return
    }
    objectUrls.current.push(preview.url)
    setDraft((current) => {
      if (!current) return current
      URL.revokeObjectURL(current.previewUrl)
      return {
        ...current,
        treatment: preview.treatment,
        clean: cleanOverride ?? preview.clean,
        reason: reasonOverride ?? preview.reason,
        transparent: preview.transparent,
        tolerance,
        previewUrl: preview.url
      }
    })
  }

  const onToleranceChange = (value: number) => {
    setDraft((current) =>
      current ? { ...current, tolerance: value } : current
    )
    pendingTolerance.current = value
    if (toleranceFrame.current !== null) return
    toleranceFrame.current = requestAnimationFrame(() => {
      toleranceFrame.current = null
      const next = pendingTolerance.current
      pendingTolerance.current = null
      if (next !== null && draft) void restyle(draft.treatment, next)
    })
  }

  const compressForUpload = async (
    file: File,
    options: CompressImageOptions
  ): Promise<File | null> => {
    try {
      return await compressImage(file, options)
    } catch {
      setError(true)
      return null
    }
  }

  const apply = async () => {
    if (!draft) return

    if (draft.treatment === "full_bleed") {
      const compressedSource = await compressForUpload(draft.file, {
        maxEdge: 1024,
        hasAlpha: draft.transparent,
        quality: 0.85
      })
      if (!compressedSource) return
      const uploadedSource = await upload({ file: compressedSource })
      if (Exit.isFailure(uploadedSource)) return
      const saved = await update({
        iconImage: buildIconImage({
          classification: {
            treatment: "full_bleed",
            clean: false,
            transparent: false,
            tolerance: draft.tolerance
          },
          sourceAttachmentId: uploadedSource.value.id,
          renderedAttachmentId: uploadedSource.value.id,
          crop: ICON_CROP
        })
      })
      if (Exit.isSuccess(saved)) closeDraft()
      return
    }

    const { source, alpha, clean, reason } = analyseAt(
      draft.bitmap,
      CUTOUT_APPLY_MAX_EDGE,
      draft.tolerance
    )
    const transparent = hasAlpha(source)

    if (!clean) {
      await restyle(
        "full_bleed",
        draft.tolerance,
        false,
        reason ?? "background"
      )
      return
    }

    const classification: IconClassification = {
      treatment: draft.treatment,
      clean,
      transparent,
      tolerance: draft.tolerance
    }

    const compressedSource = await compressForUpload(draft.file, {
      maxEdge: 1024,
      hasAlpha: transparent,
      quality: 0.85
    })
    if (!compressedSource) return
    const uploadedSource = await upload({ file: compressedSource })
    if (Exit.isFailure(uploadedSource)) return

    const uploadedRendered = await upload({
      file: new File([await compositeToBlob(source, alpha)], "icon.png", {
        type: "image/png"
      })
    })
    if (Exit.isFailure(uploadedRendered)) return

    const saved = await update({
      iconImage: buildIconImage({
        classification,
        sourceAttachmentId: uploadedSource.value.id,
        renderedAttachmentId: uploadedRendered.value.id,
        crop: ICON_CROP
      })
    })
    if (Exit.isSuccess(saved)) closeDraft()
  }

  const remove = () => {
    void update({ iconImage: null })
  }

  const treatmentItems: ReadonlyArray<SegmentedItem<IconTreatment>> = [
    { key: "sticker", label: m.project_icon_treatment_sticker() },
    { key: "full_bleed", label: m.project_icon_treatment_full_bleed() }
  ]

  return (
    <fieldset disabled={submitting} className="contents">
      <div className="flex flex-col gap-2">
        {draft ? (
          <div className="flex flex-col gap-2">
            <img
              src={draft.previewUrl}
              alt=""
              width={64}
              height={64}
              className={cn(
                "size-16 object-cover",
                draft.treatment === "sticker"
                  ? "[filter:drop-shadow(0_0_1px_var(--icon-sticker-outline))_drop-shadow(0_1px_2px_rgb(0_0_0/0.45))]"
                  : "rounded-[25%]"
              )}
            />
            <SegmentedTabs
              items={treatmentItems}
              variant="inline"
              isActive={(key) => key === draft.treatment}
              renderItem={(item, content, { active }) => (
                <button
                  type="button"
                  aria-pressed={active}
                  disabled={item.key === "sticker" && !draft.clean}
                  onClick={() => {
                    cancelPendingTolerance()
                    void restyle(item.key, draft.tolerance)
                  }}
                  className={cn(
                    SEGMENTED_ITEM_CLASS(active, "inline"),
                    "disabled:cursor-not-allowed disabled:opacity-50"
                  )}
                >
                  {content}
                </button>
              )}
            />
            {!draft.clean && (
              <p className="text-xs text-muted-foreground">
                {draft.reason === "too_small"
                  ? m.project_icon_cutout_too_small()
                  : m.project_icon_cutout_rejected()}
              </p>
            )}
            {draft.treatment === "sticker" && !draft.transparent && (
              <Slider
                size="compact"
                label={m.project_icon_tolerance()}
                min={0}
                max={CUTOUT_MAX_TOLERANCE}
                value={draft.tolerance}
                onChange={(value) => onToleranceChange(value as number)}
              />
            )}
            {(AsyncResult.isFailure(uploadState) ||
              AsyncResult.isFailure(updateState)) && (
              <p role="alert" className="text-xs text-destructive">
                {m.project_identity_error()}
              </p>
            )}
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={closeDraft}>
                {m.project_icon_cancel()}
              </Button>
              <Button
                size="sm"
                disabled={submitting}
                onClick={() => void apply()}
              >
                {m.project_icon_apply()}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {AsyncResult.isSuccess(storage) && !storageAvailable ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="tertiary"
                        size="sm"
                        leadingIcon={Upload}
                        aria-disabled
                        className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                        onClick={() => {
                          if (!storageAvailable) return
                          fileRef.current?.click()
                        }}
                      />
                    }
                  >
                    {m.project_icon_upload()}
                  </TooltipTrigger>
                  <TooltipContent>
                    {m.project_icon_storage_required()}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Button
                variant="tertiary"
                size="sm"
                leadingIcon={Upload}
                onClick={() => fileRef.current?.click()}
              >
                {m.project_icon_upload()}
              </Button>
            )}
            {iconImage && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={m.project_icon_remove()}
                title={m.project_icon_remove()}
                onClick={remove}
              >
                <Trash2 />
              </Button>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {m.project_icon_file_rejected()}
          </p>
        )}
        <input
          ref={fileRef}
          hidden
          type="file"
          accept={PROJECT_ICON_CONTENT_TYPES.join(",")}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            void onFileSelected(file)
          }}
        />
      </div>
    </fieldset>
  )
}
