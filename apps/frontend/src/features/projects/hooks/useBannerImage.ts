import { useCallback, useEffect, useReducer, useRef, useState } from "react"

import {
  bannerImageReducer,
  initialBannerImageState,
  shouldLoadBannerImage,
  type BannerImageSize,
  type BannerImageState
} from "@/features/projects/lib/bannerImageState"
import {
  readBannerRender,
  type BannerRenderKey
} from "@/features/projects/lib/bannerRenderCache"
import {
  isImageLoaded,
  preloadImage
} from "@/features/projects/lib/imagePreload"

export type BannerImage = BannerImageState<HTMLImageElement> &
  Readonly<{
    wasCached: boolean
    onPainted: () => void
    onPlaceholderFailed: () => void
  }>

export function useBannerImage(
  source: string,
  cacheKey: BannerRenderKey | null,
  options: Readonly<{ measured: boolean; editing: boolean }>
): BannerImage {
  const { measured, editing } = options
  const [state, dispatch] = useReducer(
    bannerImageReducer<HTMLImageElement>,
    initialBannerImageState
  )
  const [wasCached] = useState(() => isImageLoaded(source))
  const requested = useRef(false)

  useEffect(() => {
    void preloadImage(source)
  }, [source])

  useEffect(() => {
    if (!measured) return undefined
    if (cacheKey === null) {
      dispatch({ type: "lookupSkipped" })
      return undefined
    }
    dispatch({ type: "lookupStarted" })
    let cancelled = false
    let objectUrl: string | null = null
    void readBannerRender(cacheKey).then((blob) => {
      if (cancelled) return
      if (blob) {
        objectUrl = URL.createObjectURL(blob)
        dispatch({ type: "lookupHit", url: objectUrl })
      } else dispatch({ type: "lookupMissed" })
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [cacheKey, measured])

  const load = shouldLoadBannerImage(state, editing)
  useEffect(() => {
    if (!load || requested.current) return undefined
    requested.current = true
    const photo = new Image()
    photo.crossOrigin = "anonymous"
    photo.addEventListener("load", () => {
      if (!requested.current) return
      dispatch({
        type: "imageLoaded",
        size: { width: photo.naturalWidth, height: photo.naturalHeight }
      })
      void photo
        .decode()
        .then(() => {
          if (requested.current)
            dispatch({ type: "imageDecoded", image: photo })
        })
        .catch(() => {
          if (requested.current) dispatch({ type: "decodeFailed" })
        })
    })
    photo.addEventListener("error", () => {
      if (!requested.current) return
      requested.current = false
      dispatch({ type: "imageFailed" })
    })
    photo.src = source
    return undefined
  }, [source, load])

  const onPainted = useCallback(() => dispatch({ type: "painted" }), [])
  const onPlaceholderFailed = useCallback(
    () => dispatch({ type: "imageFailed" }),
    []
  )

  return { ...state, wasCached, onPainted, onPlaceholderFailed }
}

export function usePlaceholderSize(
  placeholder: string | null
): BannerImageSize | null {
  const [loaded, setLoaded] = useState<Readonly<{
    src: string
    size: BannerImageSize
  }> | null>(null)
  useEffect(() => {
    if (!placeholder) return undefined
    let cancelled = false
    const thumbnail = new Image()
    thumbnail.addEventListener("load", () => {
      if (!cancelled)
        setLoaded({
          src: placeholder,
          size: {
            width: thumbnail.naturalWidth,
            height: thumbnail.naturalHeight
          }
        })
    })
    thumbnail.src = placeholder
    return () => {
      cancelled = true
    }
  }, [placeholder])
  return loaded !== null && loaded.src === placeholder ? loaded.size : null
}
