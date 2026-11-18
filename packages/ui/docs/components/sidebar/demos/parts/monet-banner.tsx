import { BannerShader } from "@pp/ui/banner-shader"
import { cn } from "@pp/ui/lib/utils"
import { useEffect, useState } from "react"

import bordighera from "../assets/bordighera.webp"
import waterLilyPond from "../assets/water-lily-pond.webp"

// Two of the app's built-in Claude Monet banners, drawn through the same
// shader and settings as the app's ProjectBanner (features/projects/lib/
// bannerPresets bannerDefaults, the preset's crop, overall opacity 0.2).
export const MONET = {
  water_lily_pond: { src: waterLilyPond, x: 0.5, y: 0.4 },
  bordighera: { src: bordighera, x: 0.5, y: 0.5 }
} as const

export type MonetBanner = keyof typeof MONET

// Decode every preset as soon as the gallery loads, so switching projects
// draws the banner in the first frame instead of waiting for a fetch.
const loaded = new Map<string, HTMLImageElement>()
for (const { src } of Object.values(MONET)) {
  if (typeof window === "undefined") break
  const img = new Image()
  img.decoding = "async"
  img.src = src
  void img.decode().then(
    () => loaded.set(src, img),
    () => undefined
  )
}

const SETTINGS = {
  pixelSize: 2,
  strength: 0.85,
  color: 0.5,
  fade: 0.8,
  opacity: 1,
  overallOpacity: 0.2,
  height: 160,
  noise: 0.3,
  noiseScale: 5.5,
  zoom: 1
}

// `className` places it: the sidebar header's 32px strip, or the page
// header's 160px backdrop (ProjectBanner's "row" and "header" variants).
export function MonetStrip({
  banner,
  className = "absolute inset-0 -z-10"
}: Readonly<{ banner: MonetBanner; className?: string }>) {
  const preset = MONET[banner]
  const [fetched, setFetched] = useState<HTMLImageElement | null>(null)
  const image =
    loaded.get(preset.src) ??
    (fetched?.src.endsWith(preset.src) ? fetched : null)
  useEffect(() => {
    if (loaded.has(preset.src)) return undefined
    let live = true
    const img = new Image()
    img.src = preset.src
    void img.decode().then(
      () => {
        loaded.set(preset.src, img)
        if (live) setFetched(img)
      },
      () => undefined
    )
    return () => {
      live = false
    }
  }, [preset.src])
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none overflow-hidden", className)}
      style={{ opacity: SETTINGS.overallOpacity }}
    >
      {image ? (
        <BannerShader
          image={image}
          settings={{ ...SETTINGS, x: preset.x, y: preset.y }}
          mode="image"
          label=""
        />
      ) : null}
    </span>
  )
}
