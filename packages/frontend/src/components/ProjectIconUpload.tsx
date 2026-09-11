import { useEffect, useRef, useState } from "react"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Exit from "effect/Exit"
import {
  ATTACHMENT_MAX_BYTES,
  isRasterImageContentType,
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
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"
import {
  hasAlpha,
  CUTOUT_DEFAULT_TOLERANCE,
  CUTOUT_MAX_TOLERANCE
} from "@/lib/iconCutout"
import {
  analyseAt,
  buildDraftPreview,
  buildIconImage,
  compositeToBlob,
  CUTOUT_APPLY_MAX_EDGE,
  type IconClassification,
  type IconCrop,
  type IconTreatment
} from "@/lib/iconDraft"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import { Trash2, Upload } from "lucide-react"

interface Draft {
  readonly file: File
  readonly bitmap: ImageBitmap
  readonly treatment: IconTreatment
  readonly clean: boolean
  readonly transparent: boolean
  readonly tolerance: number
  readonly previewUrl: string
}

const ICON_CROP: IconCrop = { x: 0.5, y: 0.5, zoom: 1 }

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

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
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
    if (draft) {
      URL.revokeObjectURL(draft.previewUrl)
      draft.bitmap.close()
    }
    setDraft(null)
    setError(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  const onFileSelected = async (file: File) => {
    if (fileRef.current) fileRef.current.value = ""
    if (
      !isRasterImageContentType(file.type) ||
      file.size > ATTACHMENT_MAX_BYTES ||
      file.size === 0
    ) {
      setError(true)
      return
    }
    setError(false)
    restyleToken.current++
    cancelPendingTolerance()
    try {
      const bitmap = await createImageBitmap(file)
      const preview = await buildDraftPreview(
        bitmap,
        "sticker",
        CUTOUT_DEFAULT_TOLERANCE
      )
      objectUrls.current.push(preview.url)
      setDraft({
        file,
        bitmap,
        treatment: preview.treatment,
        clean: preview.clean,
        transparent: preview.transparent,
        tolerance: CUTOUT_DEFAULT_TOLERANCE,
        previewUrl: preview.url
      })
    } catch {
      setError(true)
    }
  }

  const restyle = async (treatment: IconTreatment, tolerance: number) => {
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
        clean: preview.clean,
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

    const { source, alpha, clean } = analyseAt(
      draft.bitmap,
      CUTOUT_APPLY_MAX_EDGE,
      draft.tolerance
    )
    const transparent = hasAlpha(source)

    if (!clean) {
      setDraft((current) =>
        current
          ? { ...current, clean: false, treatment: "full_bleed" }
          : current
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

    const uploadedRendered = transparent
      ? await upload({ file: draft.file })
      : await upload({
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
            <div className="flex items-center gap-1">
              <Button
                variant="tertiary"
                size="sm"
                aria-pressed={draft.treatment === "sticker"}
                disabled={!draft.clean}
                onClick={() => void restyle("sticker", draft.tolerance)}
              >
                {m.project_icon_treatment_sticker()}
              </Button>
              <Button
                variant="tertiary"
                size="sm"
                aria-pressed={draft.treatment === "full_bleed"}
                onClick={() => void restyle("full_bleed", draft.tolerance)}
              >
                {m.project_icon_treatment_full_bleed()}
              </Button>
            </div>
            {!draft.clean && (
              <p className="text-xs text-muted-foreground">
                {m.project_icon_cutout_rejected()}
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
          accept="image/png,image/jpeg,image/webp,image/avif"
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
