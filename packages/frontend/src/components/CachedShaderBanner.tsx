import { useCallback, useEffect, useRef, useState } from "react"
import {
  writeBannerRender,
  type BannerRenderKey
} from "@/lib/bannerRenderCache"
import {
  ProjectBannerPrototypeShader,
  type BannerPrototypeSettings
} from "./ProjectBannerPrototypeShader"
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
  readonly signature: string
}

const signatureOf = (
  image: HTMLImageElement,
  settings: BannerPrototypeSettings
) => `${image.src}|${settings.x}|${settings.y}|${settings.zoom}`

export function CachedShaderBanner({
  image,
  settings,
  cacheKey,
  live = false,
  onFirstRender
}: {
  image: HTMLImageElement
  settings: BannerPrototypeSettings
  cacheKey: BannerRenderKey | null
  /**
   * Keeps the canvas — and with it the compiled program and uploaded texture —
   * mounted so crop changes cost a uniform update instead of a fresh context.
   */
  live?: boolean
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

  useEffect(
    () => () => {
      if (rendered) URL.revokeObjectURL(rendered.src)
    },
    [rendered]
  )

  const signature = signatureOf(image, settings)

  const capture = useCallback(
    (canvas: HTMLCanvasElement) => {
      onFirstRender?.()
      // A live crop redraws on every pointer move; encoding each of those to
      // WebP would stall the drag and evict the real render from the cache.
      if (live) return
      if (
        canvas.width <= 0 ||
        canvas.height <= 0 ||
        size.width <= 0 ||
        size.height <= 0
      )
        return
      void toBlob(canvas).then((blob) => {
        if (!blob) return
        setRendered({ src: URL.createObjectURL(blob), ...size, signature })
        if (cacheKey) void writeBannerRender(cacheKey, blob)
      })
    },
    [size, onFirstRender, cacheKey, live, signature]
  )

  const usable =
    rendered &&
    rendered.width === size.width &&
    rendered.height === size.height &&
    rendered.signature === signature

  return (
    <div ref={ref} className="size-full">
      {usable && !live ? (
        <img src={rendered.src} alt="" className="block size-full" />
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
