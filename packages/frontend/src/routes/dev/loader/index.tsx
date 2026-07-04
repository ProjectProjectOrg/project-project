import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { Loader } from "@/components/Loader"
import { type Animation, animations } from "@/components/Loader/animations"
import { logoSvgString } from "@/components/Loader/logo-geometry"

export const Route = createFileRoute("/dev/loader/")({
  component: LoaderDebugPage
})

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
      const { p, persp, falloff = 1 } = animationRef.current(
        (t - start) * (speedRef.current || 1),
        perspRef.current
      )
      if (ref.current) ref.current.innerHTML = logoSvgString(p, persp, falloff)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div ref={ref} className="size-24 [&>svg]:size-full" />
}

function LoaderDebugPage() {
  const [speed, setSpeed] = useState(1)
  const [cells, setCells] = useState(30)
  const [paused, setPaused] = useState(false)
  const [orig, setOrig] = useState(true)
  const [animIdx, setAnimIdx] = useState(0)
  const [persp, setPersp] = useState(0.5)
  const uniforms = { originalColors: orig }
  const anim = animations[animIdx].fn
  const sizes = [24, 48, 96, 240]
  const common = {
    speed,
    paused,
    ditherCells: cells,
    uniforms,
    animation: anim,
    perspective: persp
  }

  return (
    <div className="mx-auto max-w-4xl space-y-10 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Loader debug</h1>
        <p className="text-muted-foreground text-sm">
          Dithered fold loader — compare animations across contexts.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {animations.map((a, i) => (
          <button
            key={a.name}
            type="button"
            onClick={() => setAnimIdx(i)}
            className={`rounded-md border px-3 py-1 text-sm transition-colors transition-transform duration-100 active:scale-[0.97] ${
              i === animIdx
                ? "bg-foreground text-background"
                : "hover:bg-muted"
            }`}
          >
            {a.name}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-6 text-sm">
        <label className="flex items-center gap-2">
          speed
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.25}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
          <span className="tabular-nums">{speed}×</span>
        </label>
        <label className="flex items-center gap-2">
          dither cells
          <input
            type="range"
            min={12}
            max={80}
            step={1}
            value={cells}
            onChange={(e) => setCells(Number(e.target.value))}
          />
          <span className="tabular-nums">{cells}</span>
        </label>
        <label className="flex items-center gap-2">
          perspective
          <input
            type="range"
            min={0.2}
            max={0.8}
            step={0.01}
            value={persp}
            onChange={(e) => setPersp(Number(e.target.value))}
          />
          <span className="tabular-nums">{persp.toFixed(2)}</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={orig}
            onChange={(e) => setOrig(e.target.checked)}
          />
          originalColors
        </label>
        <button
          type="button"
          className="rounded-md border px-3 py-1 transition-colors transition-transform duration-100 active:scale-[0.97]"
          onClick={() => setPaused((v) => !v)}
        >
          {paused ? "play" : "pause"}
        </button>
      </div>

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
        <RawSvgPreview animation={anim} speed={speed} persp={persp} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Full bleed</h2>
        <div className="flex h-64 items-center justify-center rounded-lg border">
          <Loader size="60%" {...common} />
        </div>
      </section>
    </div>
  )
}
