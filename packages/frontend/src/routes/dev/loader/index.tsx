import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { Loader } from "@/components/Loader"
import { logoSvgString } from "@/components/Loader/logo-geometry"
import { breathingP } from "@/components/Loader/Loader"

export const Route = createFileRoute("/dev/loader/")({
  component: LoaderDebugPage
})

function RawSvgPreview({ speed }: { speed: number }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const p = breathingP(t - start, 4000 / (speed || 1))
      if (ref.current) ref.current.innerHTML = logoSvgString(p)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [speed])
  return <div ref={ref} className="size-24 [&>svg]:size-full" />
}

function LoaderDebugPage() {
  const [speed, setSpeed] = useState(1)
  const [cells, setCells] = useState(30)
  const [paused, setPaused] = useState(false)
  const [orig, setOrig] = useState(false)
  const uniforms = { originalColors: orig }
  const sizes = [24, 48, 96, 240]

  return (
    <div className="mx-auto max-w-4xl space-y-10 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Loader debug</h1>
        <p className="text-muted-foreground text-sm">
          Dithered breathing-fold loader across contexts.
        </p>
      </header>

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
              <Loader
                size={s}
                speed={speed}
                paused={paused}
                ditherCells={cells}
                uniforms={uniforms}
              />
              <span className="text-muted-foreground text-xs">{s}px</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-3 gap-4">
        <div className="flex items-center justify-center rounded-lg bg-white p-10">
          <Loader
            size={160}
            speed={speed}
            paused={paused}
            ditherCells={cells}
            uniforms={uniforms}
          />
        </div>
        <div className="flex items-center justify-center rounded-lg bg-neutral-950 p-10">
          <Loader
            size={160}
            speed={speed}
            paused={paused}
            ditherCells={cells}
            uniforms={uniforms}
          />
        </div>
        <div
          className="flex items-center justify-center rounded-lg p-10"
          style={{ backgroundColor: "#000C38" }}
        >
          <Loader
            size={160}
            speed={speed}
            paused={paused}
            ditherCells={cells}
            uniforms={uniforms}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Raw SVG (undithered source)</h2>
        <RawSvgPreview speed={speed} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Full bleed</h2>
        <div className="flex h-64 items-center justify-center rounded-lg border">
          <Loader
            size="60%"
            speed={speed}
            paused={paused}
            ditherCells={cells}
            uniforms={uniforms}
          />
        </div>
      </section>
    </div>
  )
}
