import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react"
import { useAtomValue } from "@effect/atom-react"
import { motion, useReducedMotion } from "motion/react"
import type { ProjectBanner as Banner } from "@projectproject/shared"
import { projectBannerPreviewAtom, projectKey } from "@/atoms/projects"
import {
  bucketRenderWidth,
  readBannerRender,
  type BannerRenderKey
} from "@/lib/bannerRenderCache"
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
  const appliedSource = bannerSource(
    orgSlug,
    banner,
    typeof window === "undefined" ? undefined : window.innerWidth
  )
  const appliedCrop = banner?.crop ?? bannerDefaults
  const source = preview ? preview.source : appliedSource
  const crop = preview?.crop ?? appliedCrop
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
  const [shaderFailed, setShaderFailed] = useState(false)
  const [placeholderSize, setPlaceholderSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const wasCached = useMemo(
    () => (source ? isImageLoaded(source) : false),
    [source]
  )
  const observerRef = useRef<ResizeObserver | null>(null)
  const requestedSourceRef = useRef<string | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [cachedRender, setCachedRender] = useState<string | null>(null)
  const [lookupSettled, setLookupSettled] = useState(false)
  const [measured, setMeasured] = useState(false)

  const bucketedWidth =
    containerSize.width > 0 ? bucketRenderWidth(containerSize.width) : 0

  const cacheKey = useMemo<BannerRenderKey | null>(
    () =>
      source === null ||
      changed ||
      bucketedWidth <= 0 ||
      containerSize.height <= 0
        ? null
        : {
            project: projectKey(orgSlug, slug),
            source,
            variant,
            crop: { x: crop.x, y: crop.y, zoom: crop.zoom },
            width: bucketedWidth,
            height: containerSize.height,
            pixelRatio: devicePixelRatio()
          },
    [
      source,
      changed,
      bucketedWidth,
      containerSize.height,
      orgSlug,
      slug,
      variant,
      crop.x,
      crop.y,
      crop.zoom
    ]
  )

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return
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
    observerRef.current = observer
    const width = Math.round(node.clientWidth)
    const height = Math.round(node.clientHeight)
    if (width > 0 && height > 0) setContainerSize({ width, height })
    setMeasured(true)
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  useEffect(() => {
    if (!measured) return undefined
    setLookupSettled(cacheKey === null)
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
    setShaderFailed(false)
  }, [source])

  useEffect(() => {
    if (!source || !lookupSettled) return undefined
    if (cachedRender !== null && !editing) return undefined
    if (requestedSourceRef.current === source) return undefined
    requestedSourceRef.current = source
    const photo = new Image()
    photo.crossOrigin = "anonymous"
    const stillWanted = () => requestedSourceRef.current === source
    photo.onload = () => {
      if (!stillWanted()) return
      setNaturalSize({
        width: photo.naturalWidth,
        height: photo.naturalHeight
      })
      void photo
        .decode()
        .then(() => {
          if (stillWanted()) setShaderImage(photo)
        })
        .catch(() => {
          if (stillWanted()) setShaderFailed(true)
        })
    }
    photo.onerror = () => {
      if (!stillWanted()) return
      requestedSourceRef.current = null
      setPlaceholderFailed(true)
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
              filter:
                painted || shaderFailed
                  ? `blur(0px) grayscale(${1 - settings.color})`
                  : `blur(${blurRadius}px) grayscale(${1 - settings.color})`,
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
