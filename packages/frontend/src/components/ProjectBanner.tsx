import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { useAtomValue } from "@effect/atom-react"
import { motion, useReducedMotion } from "motion/react"
import type { ProjectBanner as Banner } from "@projectproject/shared"
import { projectBannerPreviewAtom, projectKey } from "@/atoms/projects"
import { readBannerRender, type BannerRenderKey } from "@/lib/bannerRenderCache"
import { isImageLoaded } from "@/lib/imagePreload"
import { cn } from "@/lib/utils"
import { bannerDefaults, bannerSource } from "./project-banner-presets"
import {
  bannerCropStyle,
  bannerCrossfadeTransitions,
  bannerFadeMask,
  bannerPreviewChanged
} from "./project-banner-frame"
import { CachedShaderBanner } from "./CachedShaderBanner"

const devicePixelRatio = () =>
  typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio || 1, 2)

export function ProjectBanner({
  orgSlug,
  slug,
  banner,
  waiting,
  variant = "header"
}: {
  orgSlug: string
  slug: string
  banner: Banner | null
  waiting?: boolean
  variant?: "header" | "card" | "row"
}) {
  const preview = useAtomValue(
    projectBannerPreviewAtom(projectKey(orgSlug, slug))
  )
  const appliedSource = bannerSource(orgSlug, banner)
  const appliedCrop = banner?.crop ?? bannerDefaults
  const source = preview ? preview.source : appliedSource
  const crop = preview?.crop ?? appliedCrop
  // The editor publishes the saved banner as a preview the moment it opens, so
  // "is the editor open" and "has the banner actually changed" are separate
  // questions: the first warms the shader, only the second may repaint.
  const editing = preview !== null
  const changed = bannerPreviewChanged(preview, appliedSource, appliedCrop)
  const placeholder = changed ? null : (banner?.placeholder ?? null)
  const reduceMotion = useReducedMotion() ?? false
  const [shaderImage, setShaderImage] = useState<HTMLImageElement | null>(null)
  const [naturalSize, setNaturalSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [painted, setPainted] = useState(false)
  const [placeholderFailed, setPlaceholderFailed] = useState(false)
  const [placeholderSize, setPlaceholderSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const wasCached = useMemo(
    () => (source ? isImageLoaded(source) : false),
    [source]
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const requestedSourceRef = useRef<string | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [cachedRender, setCachedRender] = useState<string | null>(null)
  const [lookupSettled, setLookupSettled] = useState(false)
  const [measured, setMeasured] = useState(false)

  const cacheKey = useMemo<BannerRenderKey | null>(
    () =>
      source === null || changed || containerSize.width <= 0
        ? null
        : {
            project: projectKey(orgSlug, slug),
            source,
            variant,
            crop: { x: crop.x, y: crop.y, zoom: crop.zoom },
            width: containerSize.width,
            pixelRatio: devicePixelRatio()
          },
    [
      source,
      changed,
      containerSize.width,
      orgSlug,
      slug,
      variant,
      crop.x,
      crop.y,
      crop.zoom
    ]
  )

  useLayoutEffect(() => {
    const node = containerRef.current
    const width = Math.round(node?.clientWidth ?? 0)
    const height = Math.round(node?.clientHeight ?? 0)
    if (width > 0 && height > 0) setContainerSize({ width, height })
    setMeasured(true)
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      setContainerSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height }
      )
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!measured) return undefined
    setLookupSettled(cacheKey === null)
    // Losing the key means the crop is being dragged; hold the settled render
    // on screen as the floor the live shader crossfades up from.
    if (cacheKey === null) return undefined
    setCachedRender(null)
    let cancelled = false
    let objectUrl: string | null = null
    void readBannerRender(cacheKey).then((blob) => {
      if (cancelled) return
      if (blob) {
        objectUrl = URL.createObjectURL(blob)
        setCachedRender(objectUrl)
      }
      setLookupSettled(true)
    })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [cacheKey, measured])

  useEffect(() => {
    requestedSourceRef.current = null
    setShaderImage(null)
    setNaturalSize(null)
    setPainted(false)
    setPlaceholderFailed(false)
    setCachedRender(null)
  }, [source])

  useEffect(() => {
    // While the editor is open the shader loads even behind a cache hit, so the
    // first drag has its texture ready instead of decoding mid-gesture.
    if (!source || !lookupSettled) return undefined
    if (cachedRender !== null && !editing) return undefined
    if (requestedSourceRef.current === source) return undefined
    requestedSourceRef.current = source
    const photo = new Image()
    photo.crossOrigin = "anonymous"
    // The request outlives this effect run. Saving a banner changes the source
    // and settles the cache lookup in separate commits, so the effect re-runs
    // mid-flight; tearing the load down there would strand it behind the guard
    // above and leave the banner blurred until a reload. Staleness is decided
    // by the ref instead, which always names the source we still want.
    const current = () => requestedSourceRef.current === source
    photo.onload = () => {
      if (!current()) return
      setNaturalSize({
        width: photo.naturalWidth,
        height: photo.naturalHeight
      })
      void photo
        .decode()
        .then(() => {
          if (current()) setShaderImage(photo)
        })
        .catch(() => undefined)
    }
    photo.onerror = () => {
      if (current()) requestedSourceRef.current = null
    }
    photo.src = source
    return undefined
  }, [source, lookupSettled, cachedRender, editing])

  useEffect(() => {
    setPlaceholderSize(null)
    if (!placeholder) return undefined
    let cancelled = false
    const thumbnail = new Image()
    thumbnail.onload = () => {
      if (!cancelled)
        setPlaceholderSize({
          width: thumbnail.naturalWidth,
          height: thumbnail.naturalHeight
        })
    }
    thumbnail.src = placeholder
    return () => {
      cancelled = true
    }
  }, [placeholder])

  const onShaderRender = useCallback(() => setPainted(true), [])

  if (!source) return null

  const skipBlur = wasCached
  // The settled render holds until the live shader has actually painted the new
  // crop, so a drag hands over without a blank frame in between.
  const settled =
    cachedRender !== null && !(changed && painted) ? cachedRender : null
  const shaderVisible = settled === null && (skipBlur || painted)
  const settings = { ...bannerDefaults, ...crop }
  const blurRadius = variant === "header" ? 12 : variant === "card" ? 6 : 3
  const blurSize = naturalSize ?? placeholderSize
  const cropStyle = blurSize
    ? bannerCropStyle(
        blurSize.width,
        blurSize.height,
        containerSize.width,
        containerSize.height,
        crop
      )
    : undefined
  const fadeMask = bannerFadeMask(settings.fade)
  const { unblur, dissolve } = bannerCrossfadeTransitions(reduceMotion)

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={`pointer-events-none absolute -z-10 overflow-hidden rounded-t-[inherit] ${variant === "header" ? "-inset-x-6 -top-6" : "inset-x-0 top-0"} ${waiting ? "animate-pulse" : ""}`}
      style={{
        height:
          variant === "header"
            ? bannerDefaults.height
            : variant === "card"
              ? 120
              : "100%",
        opacity: bannerDefaults.overallOpacity
      }}
    >
      {settled !== null && (
        <img
          src={settled}
          alt=""
          className="absolute inset-0 block size-full"
        />
      )}
      {settled === null && !skipBlur && !placeholderFailed && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ maskImage: fadeMask, WebkitMaskImage: fadeMask }}
        >
          <motion.img
            src={placeholder ?? source}
            alt=""
            onError={() => setPlaceholderFailed(true)}
            className={cn(
              "absolute",
              !cropStyle && "inset-0 size-full object-cover"
            )}
            style={{ ...cropStyle }}
            initial={false}
            animate={{
              filter: painted ? "blur(0px)" : `blur(${blurRadius}px)`,
              opacity: painted ? 0 : 1
            }}
            transition={{ filter: unblur, opacity: dissolve }}
          />
        </div>
      )}
      {shaderImage && (
        <motion.div
          className="absolute inset-0 size-full"
          initial={false}
          animate={{ opacity: shaderVisible ? 1 : 0 }}
          transition={skipBlur || settled !== null ? { duration: 0 } : dissolve}
        >
          <Suspense fallback={null}>
            <CachedShaderBanner
              key={`${source}/${variant}`}
              image={shaderImage}
              settings={settings}
              cacheKey={cacheKey}
              live={editing}
              onFirstRender={onShaderRender}
            />
          </Suspense>
        </motion.div>
      )}
    </div>
  )
}
