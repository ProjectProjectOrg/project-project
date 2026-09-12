import { useEffect, useRef, useState } from "react"
import {
  ATTACHMENT_MAX_BYTES,
  isProjectIconContentType
} from "@projectproject/shared"
import { CUTOUT_DEFAULT_TOLERANCE } from "@/lib/iconCutout"
import {
  buildDraftPreview,
  resolveIconTreatment,
  type CutoutRejection,
  type IconTreatment
} from "@/lib/iconDraft"

export type IconPreview = {
  readonly cutoutUrl: string
  readonly fullUrl: string
  readonly clean: boolean
  readonly reason: CutoutRejection | null
  readonly transparent: boolean
  readonly treatment: IconTreatment
}

export const draftPreviewUrl = (preview: IconPreview): string =>
  preview.treatment === "sticker" ? preview.cutoutUrl : preview.fullUrl

export type IconDraft = ReturnType<typeof useIconDraft>

export function useIconDraft() {
  const [preview, setPreview] = useState<IconPreview | null>(null)
  const [rejected, setRejected] = useState(false)
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const fileRef = useRef<File | null>(null)
  const previewUrls = useRef<ReadonlyArray<string>>([])
  const sourceUrl = useRef<string | null>(null)
  const restyleToken = useRef(0)
  const draftToken = useRef(0)
  const renderedTolerance = useRef<number | null>(null)
  const primed = useRef(false)

  useEffect(
    () => () => {
      previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current)
      bitmapRef.current?.close()
    },
    []
  )

  const restyle = async (treatment: IconTreatment, tolerance: number) => {
    const bitmap = bitmapRef.current
    if (!bitmap) return
    if (renderedTolerance.current === tolerance) {
      setPreview((current) =>
        current
          ? {
              ...current,
              treatment: resolveIconTreatment({
                treatment,
                clean: current.clean,
                transparent: current.transparent,
                tolerance
              })
            }
          : current
      )
      return
    }
    const token = ++restyleToken.current
    const draft = draftToken.current
    const next = await buildDraftPreview(bitmap, treatment, tolerance)
    const fresh = [next.cutoutUrl, next.fullUrl].filter(
      (url, index, all) => all.indexOf(url) === index
    )
    if (token !== restyleToken.current || draft !== draftToken.current) {
      fresh.forEach((url) => URL.revokeObjectURL(url))
      return
    }
    renderedTolerance.current = tolerance
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url))
    previewUrls.current = fresh
    setPreview(next)
  }

  const accept = async (
    file: File,
    initial: { treatment: IconTreatment; tolerance: number } = {
      treatment: "sticker",
      tolerance: CUTOUT_DEFAULT_TOLERANCE
    }
  ): Promise<string | null> => {
    if (
      !isProjectIconContentType(file.type) ||
      file.size > ATTACHMENT_MAX_BYTES ||
      file.size === 0
    ) {
      setRejected(true)
      return null
    }
    setRejected(false)
    const token = ++draftToken.current
    primed.current = false
    renderedTolerance.current = null
    try {
      const bitmap = await createImageBitmap(file)
      if (token !== draftToken.current) {
        bitmap.close()
        return null
      }
      bitmapRef.current?.close()
      bitmapRef.current = bitmap
      fileRef.current = file
      if (sourceUrl.current) URL.revokeObjectURL(sourceUrl.current)
      const url = URL.createObjectURL(file)
      sourceUrl.current = url
      await restyle(initial.treatment, initial.tolerance)
      return token === draftToken.current ? url : null
    } catch {
      if (token === draftToken.current) setRejected(true)
      return null
    }
  }

  const primeFrom = async (
    url: string,
    initial: { treatment: IconTreatment; tolerance: number }
  ) => {
    if (bitmapRef.current) return
    const token = draftToken.current
    try {
      const response = await fetch(url)
      if (!response.ok) return
      const blob = await response.blob()
      if (token !== draftToken.current || bitmapRef.current) return
      const accepted = await accept(
        new File([blob], "icon", { type: blob.type }),
        initial
      )
      if (accepted) primed.current = true
    } catch {
      setRejected(false)
    }
  }

  const markUnclean = () =>
    setPreview((current) =>
      current ? { ...current, clean: false, treatment: "full_bleed" } : current
    )

  return {
    preview,
    rejected,
    setRejected,
    restyle,
    accept,
    primeFrom,
    markUnclean,
    bitmap: () => bitmapRef.current,
    file: () => fileRef.current,
    fileName: () => (primed.current ? null : (fileRef.current?.name ?? null))
  }
}
