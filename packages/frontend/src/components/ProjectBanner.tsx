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
import { useReducedMotion } from "motion/react"
import type { ProjectBanner as Banner } from "@projectproject/shared"
import { projectBannerPreviewAtom, projectKey } from "@/atoms/projects"
import { isImageLoaded } from "@/lib/imagePreload"
import { cn } from "@/lib/utils"
import { bannerDefaults, bannerSource } from "./project-banner-presets"
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
  const [painted, setPainted] = useState(false)
  const [placeholderFailed, setPlaceholderFailed] = useState(false)
  const wasCached = useMemo(
    () => (source ? isImageLoaded(source) : false),
    [source]
  )

  useEffect(() => {
    setShaderImage(null)
    setPainted(false)
    setPlaceholderFailed(false)
    if (!source) return undefined
    let cancelled = false
    const photo = new Image()
    photo.crossOrigin = "anonymous"
    photo.onload = () => {
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

  return (
    <div
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
        <img
          src={source}
          alt=""
          onError={() => setPlaceholderFailed(true)}
          className={cn(
            "absolute inset-0 size-full object-cover",
            !reduceMotion && "transition-opacity duration-500 ease-out",
            painted ? "opacity-0" : "opacity-100"
          )}
          style={{
            filter: painted ? "blur(0px)" : `blur(${blurRadius}px)`,
            transition: reduceMotion ? undefined : "filter 500ms ease-out"
          }}
        />
      )}
      {shaderImage && (
        <div
          className={cn(
            "size-full",
            !skipBlur &&
              !reduceMotion &&
              "transition-opacity duration-500 ease-out",
            !skipBlur && !painted && "opacity-0"
          )}
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
        </div>
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
