import { createFileRoute } from "@tanstack/react-router"
import { DialRoot, useDialKit } from "dialkit"
import "dialkit/styles.css"
import { useEffect, useRef } from "react"
import { Loader } from "@/components/Loader"
import { type Animation, animations } from "@/components/Loader/animations"
import { logoSvgString } from "@/components/Loader/logo-geometry"

export const Route = createFileRoute("/dev/loader/")({
  component: LoaderDebugPage
})

const frac = (x: number) => x - Math.floor(x)

function hexRgba(
  hex: string,
  alpha: number
): [number, number, number, number] {
  let h = hex.replace("#", "")
  if (h.length === 3) h = h.split("").map((c) => c + c).join("")
  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255
  return [r, g, b, alpha]
}

const presetNames = animations.map((a) => a.name)

function RawSvgPreview({
  animation,
  speed,
  persp
}: {
  animation: Animation
  speed: number
  persp: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const animationRef = useRef(animation)
  const speedRef = useRef(speed)
  const perspRef = useRef(persp)
  animationRef.current = animation
  speedRef.current = speed
  perspRef.current = persp
  useEffect(() => {
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const { p, persp: pv, falloff = 1 } = animationRef.current(
        (t - start) * (speedRef.current || 1),
        perspRef.current
      )
      if (ref.current) ref.current.innerHTML = logoSvgString(p, pv, falloff)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div ref={ref} className="size-24 [&>svg]:size-full" />
}

function LoaderDebugPage() {
  const c = useDialKit("Loader", {
    animation: {
      type: "select",
      options: [...presetNames, "sweep (custom)"],
      default: "sweep (custom)"
    },
    speed: [1, 0.1, 4, 0.05],
    paused: false,
    perspective: [0.5, 0.2, 0.8, 0.01],
    sweep: {
      _collapsed: false,
      start: [-2.8, -8, 0, 0.1],
      span: [6.6, 1, 14, 0.1],
      period: [7000, 800, 16000, 100],
      falloff: [0.72, 0.05, 1, 0.01]
    },
    dither: {
      _collapsed: false,
      cells: [30, 4, 140, 1],
      colorSteps: [2, 1, 6, 1],
      originalColors: true,
      inverted: false
    },
    colors: {
      _collapsed: true,
      front: "#94ffaf",
      highlight: "#eaff94",
      back: "#000c38",
      backAlpha: [0, 0, 1, 0.01]
    }
  })

  const custom: Animation = (t, persp) => ({
    p: c.sweep.start + frac(t / c.sweep.period) * c.sweep.span,
    persp,
    falloff: c.sweep.falloff
  })
  const preset = animations.find((a) => a.name === c.animation)
  const anim: Animation = preset ? preset.fn : custom

  const uniforms = {
    colorSteps: c.dither.colorSteps,
    originalColors: c.dither.originalColors,
    inverted: c.dither.inverted,
    colorFront: hexRgba(c.colors.front, 1),
    colorHighlight: hexRgba(c.colors.highlight, 1),
    colorBack: hexRgba(c.colors.back, c.colors.backAlpha)
  }

  const common = {
    speed: c.speed,
    paused: c.paused,
    perspective: c.perspective,
    ditherCells: c.dither.cells,
    uniforms,
    animation: anim
  }
  const sizes = [24, 48, 96, 240]

  return (
    <div className="mx-auto max-w-4xl space-y-10 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Loader debug</h1>
        <p className="text-muted-foreground text-sm">
          Dial in the loader with the DialKit panel (top-right).
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Sizes</h2>
        <div className="flex flex-wrap items-end gap-8">
          {sizes.map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <Loader size={s} {...common} />
              <span className="text-muted-foreground text-xs">{s}px</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-4">
        <div className="flex items-center justify-center rounded-lg bg-white p-10">
          <Loader size={160} {...common} />
        </div>
        <div className="flex items-center justify-center rounded-lg bg-neutral-950 p-10">
          <Loader size={160} {...common} />
        </div>
        <div
          className="flex items-center justify-center rounded-lg p-10"
          style={{ backgroundColor: "#000C38" }}
        >
          <Loader size={160} {...common} />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Raw SVG (undithered source)</h2>
        <RawSvgPreview animation={anim} speed={c.speed} persp={c.perspective} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Full bleed</h2>
        <div className="flex h-64 items-center justify-center rounded-lg border">
          <Loader size="60%" {...common} />
        </div>
      </section>

      <DialRoot position="top-right" defaultOpen />
    </div>
  )
}
