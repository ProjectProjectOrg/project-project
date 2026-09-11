import { useEffect, useRef, useState } from "react"
import {
  ATTACHMENT_MAX_BYTES,
  isRasterImageContentType
} from "@projectproject/shared"
import { CUTOUT_DEFAULT_TOLERANCE } from "@/lib/iconCutout"
import {
  buildDraftPreview,
  resolveIconTreatment,
  type IconTreatment
} from "@/lib/iconDraft"

export type IconPreview = {
  readonly cutoutUrl: string
  readonly fullUrl: string
  readonly clean: boolean
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
  const objectUrls = useRef<string[]>([])
  const restyleToken = useRef(0)
  const toleranceRef = useRef<number | null>(null)
  const primed = useRef(false)

  useEffect(
    () => () => {
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url))
      bitmapRef.current?.close()
    },
    []
  )

  const restyle = async (treatment: IconTreatment, tolerance: number) => {
    const bitmap = bitmapRef.current
    if (!bitmap) return
    // Only the tolerance changes the pixels. Switching treatment picks which of
    // the two renders is the chosen one, so rebuilding them would swap both
    // tiles' images for identical copies and make the choice flicker.
    if (toleranceRef.current === tolerance) {
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
    const next = await buildDraftPreview(bitmap, treatment, tolerance)
    if (token !== restyleToken.current) {
      URL.revokeObjectURL(next.cutoutUrl)
      if (next.fullUrl !== next.cutoutUrl) URL.revokeObjectURL(next.fullUrl)
      return
    }
    toleranceRef.current = tolerance
    objectUrls.current.push(next.cutoutUrl)
    if (next.fullUrl !== next.cutoutUrl) objectUrls.current.push(next.fullUrl)
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
      !isRasterImageContentType(file.type) ||
      file.size > ATTACHMENT_MAX_BYTES ||
      file.size === 0
    ) {
      setRejected(true)
      return null
    }
    setRejected(false)
    primed.current = false
    toleranceRef.current = null
    try {
      bitmapRef.current?.close()
      bitmapRef.current = await createImageBitmap(file)
      fileRef.current = file
      const url = URL.createObjectURL(file)
      objectUrls.current.push(url)
      await restyle(initial.treatment, initial.tolerance)
      return url
    } catch {
      setRejected(true)
      return null
    }
  }

  const primeFrom = async (
    url: string,
    initial: { treatment: IconTreatment; tolerance: number }
  ) => {
    if (bitmapRef.current) return
    try {
      const response = await fetch(url)
      if (!response.ok) return
      const blob = await response.blob()
      await accept(new File([blob], "icon", { type: blob.type }), initial)
      primed.current = true
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
