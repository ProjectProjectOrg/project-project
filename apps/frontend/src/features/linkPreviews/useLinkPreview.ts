import { useAtomValue } from "@effect/atom-react"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useEffect, useMemo, useState } from "react"

import { linkPreview, linkPreviewRequest } from "./atoms/linkPreviews"

export type LinkFavicon = Readonly<
  { kind: "pending" } | { kind: "image"; src: string } | { kind: "fallback" }
>

export type LinkPreviewView = Readonly<{
  title: string | null
  favicon: LinkFavicon
}>

const PENDING: LinkFavicon = { kind: "pending" }
const FALLBACK: LinkFavicon = { kind: "fallback" }

const settledImages = new Map<string, boolean>()

const loadImage = (src: string, onSettled: (ok: boolean) => void) => {
  const image = new Image()
  image.referrerPolicy = "no-referrer"
  const settle = (ok: boolean) => {
    settledImages.set(src, ok)
    onSettled(ok)
  }
  const onLoad = () => settle(image.naturalWidth > 0)
  const onError = () => settle(false)
  image.addEventListener("load", onLoad, { once: true })
  image.addEventListener("error", onError, { once: true })
  image.src = src
  return () => {
    image.removeEventListener("load", onLoad)
    image.removeEventListener("error", onError)
  }
}

const useFaviconImage = (src: string | null | undefined): LinkFavicon => {
  const [settled, setSettled] = useState<Readonly<{
    src: string
    ok: boolean
  }> | null>(null)

  useEffect(() => {
    if (src == null || settledImages.has(src)) return undefined
    return loadImage(src, (ok) => setSettled({ src, ok }))
  }, [src])

  const ok =
    src == null
      ? undefined
      : (settledImages.get(src) ??
        (settled?.src === src ? settled.ok : undefined))

  return useMemo(() => {
    if (src === undefined) return PENDING
    if (src === null) return FALLBACK
    if (ok === undefined) return PENDING
    return ok ? { kind: "image", src } : FALLBACK
  }, [src, ok])
}

export const useLinkPreview = (url: string): LinkPreviewView => {
  const result = useAtomValue(linkPreview(linkPreviewRequest(url)))
  const preview = AsyncResult.isSuccess(result) ? result.value : null
  const faviconUrl =
    preview !== null
      ? preview.faviconUrl
      : AsyncResult.isInitial(result)
        ? undefined
        : null
  return {
    title: preview?.title ?? null,
    favicon: useFaviconImage(faviconUrl)
  }
}

export const paintLinkFavicon = (
  element: HTMLElement,
  favicon: LinkFavicon
): void => {
  element.dataset["linkFavicon"] = favicon.kind
  if (favicon.kind === "image") {
    element.style.setProperty(
      "--link-favicon",
      `url(${JSON.stringify(favicon.src)})`
    )
  } else {
    element.style.removeProperty("--link-favicon")
  }
}
