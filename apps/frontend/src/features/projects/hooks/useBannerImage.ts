import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useState
} from "react"

import {
  bannerImageReducer,
  initialBannerImageState,
  shouldLoadBannerImage,
  type BannerImageSize,
  type BannerImageState
} from "@/features/projects/lib/bannerImageState"
import {
  peekBannerRender,
  bannerRenderUrl,
  readReadyBannerRender,
  retainBannerRender,
  type BannerRenderIdentity,
  type BannerRenderKey
} from "@/features/projects/lib/bannerRenderCache"

export type BannerImage = BannerImageState<HTMLImageElement> &
  Readonly<{
    initiallyReady: boolean
    onPainted: () => void
    onRenderStarted: () => void
    onRenderReady: (url: string) => void
    onPlaceholderFailed: () => void
  }>

export function useBannerImage(
  source: string,
  cacheKey: BannerRenderKey | null,
  options: Readonly<{
    identity: BannerRenderIdentity | null
    measured: boolean
    editing: boolean
  }>
): BannerImage {
  const { identity, measured, editing } = options
  const [state, dispatch] = useReducer(
    bannerImageReducer<HTMLImageElement>,
    identity,
    (key) => ({
      ...initialBannerImageState,
      cachedRender: key ? (peekBannerRender(key)?.url ?? null) : null
    })
  )
  const [initiallyReady] = useState(() => state.cachedRender !== null)

  useLayoutEffect(() => {
    if (state.cachedRender) return retainBannerRender(state.cachedRender)
    return undefined
  }, [state.cachedRender])

  useEffect(() => {
    if (!measured) return undefined
    if (cacheKey === null) {
      dispatch({ type: "lookupSkipped" })
      return undefined
    }
    dispatch({ type: "lookupStarted" })
    let cancelled = false
    let release: (() => void) | undefined
    void readReadyBannerRender(cacheKey).then((lease) => {
      if (cancelled) {
        lease?.release()
        return
      }
      if (lease) {
        release = lease.release
        dispatch({ type: "lookupHit", url: lease.render.url })
      } else {
        const ready = peekBannerRender(cacheKey)
        if (ready && bannerRenderUrl(ready.key) === bannerRenderUrl(cacheKey)) {
          release = retainBannerRender(ready.url)
          dispatch({ type: "lookupHit", url: ready.url })
        } else dispatch({ type: "lookupMissed" })
      }
    })
    return () => {
      cancelled = true
      release?.()
    }
  }, [cacheKey, measured])

  const load = shouldLoadBannerImage(state, editing)
  useEffect(() => {
    if (!load || state.shaderImage !== null) return undefined
    let cancelled = false
    const photo = new Image()
    photo.crossOrigin = "anonymous"
    photo.src = source
    void photo.decode().then(
      () => {
        if (cancelled) return
        dispatch({
          type: "imageLoaded",
          size: { width: photo.naturalWidth, height: photo.naturalHeight }
        })
        dispatch({ type: "imageDecoded", image: photo })
      },
      () => {
        if (!cancelled) dispatch({ type: "decodeFailed" })
      }
    )
    return () => {
      cancelled = true
    }
  }, [source, load, state.shaderImage])

  const onPainted = useCallback(() => dispatch({ type: "painted" }), [])
  const onRenderStarted = useCallback(
    () => dispatch({ type: "renderStarted" }),
    []
  )
  const onRenderReady = useCallback(
    (url: string) => dispatch({ type: "lookupHit", url }),
    []
  )
  const onPlaceholderFailed = useCallback(
    () => dispatch({ type: "imageFailed" }),
    []
  )

  return {
    ...state,
    initiallyReady,
    onPainted,
    onRenderStarted,
    onRenderReady,
    onPlaceholderFailed
  }
}

const placeholderSizes = new Map<string, BannerImageSize>()
const PLACEHOLDER_LIMIT = 24

export function usePlaceholderSize(
  placeholder: string | null
): BannerImageSize | null {
  const [loaded, setLoaded] = useState<Readonly<{
    src: string
    size: BannerImageSize
  }> | null>(null)
  useEffect(() => {
    if (!placeholder || placeholderSizes.has(placeholder)) return undefined
    let cancelled = false
    const thumbnail = new Image()
    thumbnail.src = placeholder
    void thumbnail.decode().then(
      () => {
        if (cancelled) return
        const size = {
          width: thumbnail.naturalWidth,
          height: thumbnail.naturalHeight
        }
        placeholderSizes.set(placeholder, size)
        if (placeholderSizes.size > PLACEHOLDER_LIMIT) {
          const oldest = placeholderSizes.keys().next().value
          if (oldest !== undefined) placeholderSizes.delete(oldest)
        }
        setLoaded({ src: placeholder, size })
      },
      () => undefined
    )
    return () => {
      cancelled = true
    }
  }, [placeholder])
  if (placeholder === null) return null
  return (
    placeholderSizes.get(placeholder) ??
    (loaded?.src === placeholder ? loaded.size : null)
  )
}
