import { useAtomValue } from "@effect/atom-react"
import type { LinkPreview } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import { useEffect, useMemo, useState } from "react"

import { linkPreview, linkPreviewRequest } from "../atoms/linkPreviews"

export type LinkFavicon = Readonly<
  | { kind: "pending" }
  | {
      kind: "image"
      src: string
      cached: boolean
      rendering: LinkPreview["faviconRendering"]
    }
  | { kind: "fallback"; cached: boolean }
>

export type LinkPreviewView = Readonly<{
  title: string | null
  favicon: LinkFavicon
}>

const PENDING: LinkFavicon = { kind: "pending" }

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

const useFaviconImage = (
  src: string | null | undefined,
  rendering: LinkPreview["faviconRendering"]
): LinkFavicon => {
  const [initialSrc] = useState(src)
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

  const cached = src === null ? initialSrc === null : settled?.src !== src

  return useMemo(() => {
    if (src === undefined) return PENDING
    if (src === null) return { kind: "fallback", cached }
    if (ok === undefined) return PENDING
    return ok
      ? { kind: "image", src, cached, rendering }
      : { kind: "fallback", cached }
  }, [src, ok, cached, rendering])
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
    favicon: useFaviconImage(
      faviconUrl,
      preview?.faviconRendering ?? "original"
    )
  }
}

export const paintLinkFavicon = (
  element: HTMLElement,
  favicon: LinkFavicon,
  animate = favicon.kind !== "pending" && !favicon.cached
): void => {
  element.dataset["linkFavicon"] = favicon.kind
  element.dataset["linkFaviconRendering"] =
    favicon.kind === "image" ? favicon.rendering : "original"
  element.dataset["linkFaviconAnimate"] = String(animate)
  if (favicon.kind === "image") {
    element.style.setProperty(
      "--link-favicon",
      `url(${JSON.stringify(favicon.src)})`
    )
  } else {
    element.style.removeProperty("--link-favicon")
  }
}
