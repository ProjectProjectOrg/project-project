import { useEffect, useRef, useState } from "react"
import {
  ATTACHMENT_MAX_BYTES,
  isRasterImageContentType
} from "@projectproject/shared"
import { CUTOUT_DEFAULT_TOLERANCE } from "@/lib/iconCutout"
import { buildDraftPreview, type IconTreatment } from "@/lib/iconDraft"

export type IconPreview = {
  readonly url: string
  readonly clean: boolean
  readonly transparent: boolean
  readonly treatment: IconTreatment
}

export type IconDraft = ReturnType<typeof useIconDraft>

export function useIconDraft() {
  const [preview, setPreview] = useState<IconPreview | null>(null)
  const [rejected, setRejected] = useState(false)
  const bitmapRef = useRef<ImageBitmap | null>(null)
  const fileRef = useRef<File | null>(null)
  const objectUrls = useRef<string[]>([])
  const restyleToken = useRef(0)

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
    const token = ++restyleToken.current
    const next = await buildDraftPreview(bitmap, treatment, tolerance)
    if (token !== restyleToken.current) {
      URL.revokeObjectURL(next.url)
      return
    }
    objectUrls.current.push(next.url)
    setPreview(next)
  }

  const accept = async (file: File): Promise<string | null> => {
    if (
      !isRasterImageContentType(file.type) ||
      file.size > ATTACHMENT_MAX_BYTES ||
      file.size === 0
    ) {
      setRejected(true)
      return null
    }
    setRejected(false)
    try {
      bitmapRef.current?.close()
      bitmapRef.current = await createImageBitmap(file)
      fileRef.current = file
      const url = URL.createObjectURL(file)
      objectUrls.current.push(url)
      await restyle("sticker", CUTOUT_DEFAULT_TOLERANCE)
      return url
    } catch {
      setRejected(true)
      return null
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
    markUnclean,
    bitmap: () => bitmapRef.current,
    file: () => fileRef.current
  }
}
