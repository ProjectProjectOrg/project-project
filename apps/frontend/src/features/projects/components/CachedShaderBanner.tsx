import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from "react"

import {
  bannerRenderGeneration,
  bannerRenderUrl,
  prepareBannerRender,
  writeBannerRender,
  type BannerRenderKey
} from "@/features/projects/lib/bannerRenderCache"
import { m } from "@/paraglide/messages"

import type { BannerShaderSettings } from "./BannerShader"

const BannerShader = lazy(() =>
  import("./BannerShader").then((module) => ({
    default: module.BannerShader
  }))
)

const RENDER_QUALITY = 0.9

const toBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
  new Promise((resolve) => {
    if (typeof canvas.toBlob !== "function") return resolve(null)
    canvas.toBlob(resolve, "image/webp", RENDER_QUALITY)
  })

export function CachedShaderBanner({
  image,
  settings,
  cacheKey,
  live = false,
  onFirstRender,
  onRenderStarted,
  onRenderReady
}: Readonly<{
  image: HTMLImageElement
  settings: BannerShaderSettings
  cacheKey: BannerRenderKey | null
  live?: boolean
  onFirstRender: () => void
  onRenderStarted: () => void
  onRenderReady: (url: string) => void
}>) {
  const generation = useMemo(
    () => (cacheKey ? bannerRenderGeneration(cacheKey.project) : null),
    [cacheKey]
  )
  const mounted = useRef(false)
  const captured = useRef<string | null>(null)
  const leases = useRef(new Set<() => void>())

  useLayoutEffect(onRenderStarted, [onRenderStarted])

  useEffect(() => {
    mounted.current = true
    const pending = leases.current
    return () => {
      mounted.current = false
      for (const release of pending) release()
      pending.clear()
    }
  }, [])

  const capture = useCallback(
    (canvas: HTMLCanvasElement) => {
      if (canvas.width <= 0 || canvas.height <= 0) return
      onFirstRender()
      if (live || !cacheKey || !generation) return
      const entry = bannerRenderUrl(cacheKey)
      if (captured.current === entry) return
      captured.current = entry
      void toBlob(canvas)
        .then(async (blob) => {
          if (!blob) return
          const lease = await prepareBannerRender(cacheKey, blob, generation)
          if (!lease) return
          void writeBannerRender(cacheKey, blob, generation)
          if (!mounted.current || captured.current !== entry) {
            lease.release()
            return
          }
          leases.current.add(lease.release)
          onRenderReady(lease.render.url)
        })
        .catch(() => {
          if (captured.current === entry) captured.current = null
        })
    },
    [cacheKey, generation, live, onFirstRender, onRenderReady]
  )

  return (
    <Suspense fallback={null}>
      <BannerShader
        image={image}
        settings={settings}
        mode="mask"
        label={m.project_banner_settings_live_preview()}
        onRender={capture}
      />
    </Suspense>
  )
}
