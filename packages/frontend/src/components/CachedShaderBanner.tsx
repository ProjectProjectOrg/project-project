import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import {
  writeBannerRender,
  type BannerRenderKey
} from "@/lib/bannerRenderCache"
import type { BannerPrototypeSettings } from "./ProjectBannerPrototypeShader"

const ProjectBannerPrototypeShader = lazy(() =>
  import("./ProjectBannerPrototypeShader").then((module) => ({
    default: module.ProjectBannerPrototypeShader
  }))
)
import { m } from "@/paraglide/messages"

const RENDER_QUALITY = 0.9

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    if (typeof canvas.toBlob !== "function") return resolve(null)
    canvas.toBlob(resolve, "image/webp", RENDER_QUALITY)
  })

type Rendered = {
  readonly src: string
  readonly width: number
  readonly height: number
}

export function CachedShaderBanner({
  image,
  settings,
  cacheKey,
  onFirstRender
}: {
  image: HTMLImageElement
  settings: BannerPrototypeSettings
  cacheKey: BannerRenderKey | null
  onFirstRender?: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [rendered, setRendered] = useState<Rendered | null>(null)

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

  useEffect(() => {
    setRendered(null)
  }, [cacheKey])

  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(
    () => () => {
      if (rendered) URL.revokeObjectURL(rendered.src)
    },
    [rendered]
  )

  const capture = useCallback(
    (canvas: HTMLCanvasElement) => {
      onFirstRender?.()
      if (
        canvas.width <= 0 ||
        canvas.height <= 0 ||
        size.width <= 0 ||
        size.height <= 0
      )
        return
      if (!cacheKey) return
      void toBlob(canvas).then((blob) => {
        if (!blob) return
        void writeBannerRender(cacheKey, blob)
        if (!mounted.current) return
        setRendered({ src: URL.createObjectURL(blob), ...size })
      })
    },
    [size, onFirstRender, cacheKey]
  )

  const usable =
    rendered && rendered.width === size.width && rendered.height === size.height

  return (
    <div ref={ref} className="size-full">
      {usable ? (
        <img src={rendered.src} alt="" className="block size-full" />
      ) : (
        size.width > 0 &&
        size.height > 0 && (
          <Suspense fallback={null}>
            <ProjectBannerPrototypeShader
              image={image}
              settings={settings}
              mode="mask"
              label={m.project_banner_settings_live_preview()}
              onRender={capture}
            />
          </Suspense>
        )
      )}
    </div>
  )
}
