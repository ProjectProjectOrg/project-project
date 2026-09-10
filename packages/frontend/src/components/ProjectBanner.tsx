import {
  lazy,
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
import { isImageLoaded } from "@/lib/imagePreload"
import { cn } from "@/lib/utils"
import { bannerDefaults, bannerSource } from "./project-banner-presets"
import {
  bannerCropStyle,
  bannerCrossfadeTransitions,
  bannerFadeMask
} from "./project-banner-frame"
import type { BannerPrototypeSettings } from "./ProjectBannerPrototypeShader"
import { m } from "@/paraglide/messages"

const ProjectBannerPrototypeShader = lazy(() =>
  import("./ProjectBannerPrototypeShader").then((module) => ({
    default: module.ProjectBannerPrototypeShader
  }))
)

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
  const source = preview ? preview.source : bannerSource(orgSlug, banner)
  const crop = preview?.crop ?? banner?.crop ?? bannerDefaults
  const reduceMotion = useReducedMotion() ?? false
  const [shaderImage, setShaderImage] = useState<HTMLImageElement | null>(null)
  const [naturalSize, setNaturalSize] = useState<{
    width: number
    height: number
  } | null>(null)
  const [painted, setPainted] = useState(false)
  const [placeholderFailed, setPlaceholderFailed] = useState(false)
  const wasCached = useMemo(
    () => (source ? isImageLoaded(source) : false),
    [source]
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

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
    setShaderImage(null)
    setNaturalSize(null)
    setPainted(false)
    setPlaceholderFailed(false)
    if (!source) return undefined
    let cancelled = false
    const photo = new Image()
    photo.crossOrigin = "anonymous"
    photo.onload = () => {
      if (!cancelled)
        setNaturalSize({
          width: photo.naturalWidth,
          height: photo.naturalHeight
        })
      void photo
        .decode()
        .then(() => {
          if (!cancelled) setShaderImage(photo)
        })
        .catch(() => undefined)
    }
    photo.src = source
    return () => {
      cancelled = true
    }
  }, [source])

  const onShaderRender = useCallback(() => setPainted(true), [])

  if (!source) return null

  const skipBlur = wasCached
  const settings = { ...bannerDefaults, ...crop }
  const blurRadius = variant === "header" ? 12 : variant === "card" ? 6 : 3
  const cropStyle = naturalSize
    ? bannerCropStyle(
        naturalSize.width,
        naturalSize.height,
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
      {!skipBlur && !placeholderFailed && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ maskImage: fadeMask, WebkitMaskImage: fadeMask }}
        >
          <motion.img
            src={source}
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
          className="size-full"
          initial={false}
          animate={{ opacity: skipBlur || painted ? 1 : 0 }}
          transition={skipBlur ? { duration: 0 } : dissolve}
        >
          <Suspense fallback={null}>
            {variant === "header" ? (
              <ProjectBannerPrototypeShader
                image={shaderImage}
                settings={settings}
                mode="mask"
                label={m.project_banner_settings_live_preview()}
                onRender={onShaderRender}
              />
            ) : (
              <StaticBanner
                key={`${source}/${crop.x}/${crop.y}/${crop.zoom}/${variant}`}
                image={shaderImage}
                settings={settings}
                onFirstRender={onShaderRender}
              />
            )}
          </Suspense>
        </motion.div>
      )}
    </div>
  )
}

function StaticBanner({
  image,
  settings,
  onFirstRender
}: {
  image: HTMLImageElement
  settings: BannerPrototypeSettings
  onFirstRender?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [bitmap, setBitmap] = useState<{
    src: string
    width: number
    height: number
  } | null>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const width = Math.round(entry.contentRect.width)
      const height = Math.round(entry.contentRect.height)
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height }
      )
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const capture = useCallback(
    (canvas: HTMLCanvasElement) => {
      onFirstRender?.()
      if (
        canvas.width > 0 &&
        canvas.height > 0 &&
        size.width > 0 &&
        size.height > 0
      )
        setBitmap({ src: canvas.toDataURL("image/png"), ...size })
    },
    [size, onFirstRender]
  )
  return (
    <div ref={ref} className="size-full">
      {bitmap &&
      bitmap.width === size.width &&
      bitmap.height === size.height ? (
        <img src={bitmap.src} alt="" className="block size-full" />
      ) : (
        size.width > 0 &&
        size.height > 0 && (
          <ProjectBannerPrototypeShader
            image={image}
            settings={settings}
            mode="mask"
            label={m.project_banner_settings_live_preview()}
            onRender={capture}
          />
        )
      )}
    </div>
  )
}
