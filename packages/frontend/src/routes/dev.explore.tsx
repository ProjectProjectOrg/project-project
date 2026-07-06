import { createFileRoute } from "@tanstack/react-router"
import { DialRoot, useDialKit } from "dialkit"
import "dialkit/styles.css"
import { useEffect, useRef } from "react"
import logoRaw from "@/public/logo/logo.svg?raw"

export const Route = createFileRoute("/dev/explore")({
  component: ExplorePage
})

type LogoPath = { d: string; fill: string }

const parsed = new DOMParser().parseFromString(logoRaw, "image/svg+xml")
const VIEWBOX =
  parsed.querySelector("svg")?.getAttribute("viewBox") ?? "0 0 245 245"
const PATHS: LogoPath[] = Array.from(parsed.querySelectorAll("path")).map(
  (p) => ({
    d: p.getAttribute("d") ?? "",
    fill: p.getAttribute("fill") ?? "#FEFEFE"
  })
)

type ShimmerParams = {
  speed: number
  angle: number
  baseOpacity: number
  bandWidth: number
  travel: number
  maskScale: number
}

function Shimmer({
  params,
  size
}: {
  params: ShimmerParams
  size: number | string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const paramsRef = useRef(params)
  paramsRef.current = params

  useEffect(() => {
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const { speed, travel } = paramsRef.current
      const phase = ((t - start) / (speed * 1000)) % 1
      const x = travel - phase * (2 * travel)
      const el = ref.current
      if (el) {
        el.style.webkitMaskPosition = `${x}% 0`
        el.style.maskPosition = `${x}% 0`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const { angle, baseOpacity, bandWidth, maskScale } = params
  const dim = `rgba(0,0,0,${baseOpacity})`
  const band = `linear-gradient(${angle}deg, ${dim} ${50 - bandWidth}%, #000 50%, ${dim} ${50 + bandWidth}%)`
  const dimPx = typeof size === "number" ? `${size}px` : size

  return (
    <div
      ref={ref}
      style={{
        width: dimPx,
        height: dimPx,
        WebkitMaskImage: band,
        maskImage: band,
        WebkitMaskSize: `${maskScale}% 100%`,
        maskSize: `${maskScale}% 100%`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat"
      }}
    >
      <svg viewBox={VIEWBOX} style={{ width: "100%", height: "100%" }}>
        {PATHS.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill} />
        ))}
      </svg>
    </div>
  )
}

function ExplorePage() {
  const c = useDialKit("Shimmer", {
    speed: [1.8, 0.3, 5, 0.1],
    angle: [100, 0, 180, 1],
    baseOpacity: [0.12, 0, 1, 0.01],
    bandWidth: [12, 1, 45, 1],
    travel: [130, 100, 260, 5],
    maskScale: [300, 150, 500, 10]
  })
  const params: ShimmerParams = {
    speed: c.speed,
    angle: c.angle,
    baseOpacity: c.baseOpacity,
    bandWidth: c.bandWidth,
    travel: c.travel,
    maskScale: c.maskScale
  }
  const sizes = [24, 48, 96, 160]

  return (
    <div className="mx-auto max-w-4xl space-y-10 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Shimmer loader</h1>
        <p className="text-muted-foreground text-sm">
          Real logo revealed through a sweeping gradient mask. Dial it with the
          panel (top-right).
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Sizes</h2>
        <div className="flex flex-wrap items-end gap-8 rounded-lg bg-neutral-950 p-8">
          {sizes.map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <Shimmer params={params} size={s} />
              <span className="text-xs text-neutral-500">{s}px</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-4">
        <div className="flex items-center justify-center rounded-lg bg-white p-10">
          <Shimmer params={params} size={120} />
        </div>
        <div className="flex items-center justify-center rounded-lg bg-neutral-950 p-10">
          <Shimmer params={params} size={120} />
        </div>
        <div
          className="flex items-center justify-center rounded-lg p-10"
          style={{ backgroundColor: "#000C38" }}
        >
          <Shimmer params={params} size={120} />
        </div>
      </section>

      <DialRoot position="top-right" defaultOpen />
    </div>
  )
}
