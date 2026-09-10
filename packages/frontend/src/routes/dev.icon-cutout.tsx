// THROWAWAY — T-136 cutout probe UI. Dev-only route, not shipped, so the
// strings here deliberately bypass paraglide.
import { createFileRoute } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  analyzeCutout,
  type CutoutResult,
  type MatchMode
} from "@/dev/icon-cutout/cutout"
import { Slider } from "@/components/ui/slider"

export const Route = createFileRoute("/dev/icon-cutout")({
  component: IconCutoutProbe
})

const fixtureUrls = import.meta.glob("../dev/icon-cutout/fixtures/*.png", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>

const fixtures = Object.entries(fixtureUrls)
  .map(([path, url]) => ({
    name: path
      .split("/")
      .pop()!
      .replace(/\.png$/, ""),
    url
  }))
  .sort((a, b) => a.name.localeCompare(b.name))

const MAX_EDGE = 512

const loadImageData = (src: string): Promise<ImageData> =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
      const width = Math.max(1, Math.round(img.width * scale))
      const height = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!
      ctx.drawImage(img, 0, 0, width, height)
      resolve(ctx.getImageData(0, 0, width, height))
    }
    img.onerror = () => reject(new Error(`could not load ${src}`))
    img.src = src
  })

function CutoutCanvas({
  source,
  alpha,
  className
}: {
  source: ImageData
  alpha: Uint8ClampedArray | null
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = source.width
    canvas.height = source.height
    const ctx = canvas.getContext("2d")!
    const out = ctx.createImageData(source.width, source.height)
    out.data.set(source.data)
    if (alpha)
      for (let p = 0; p < alpha.length; p++) out.data[p * 4 + 3] = alpha[p]
    ctx.putImageData(out, 0, 0)
  }, [source, alpha])
  return <canvas ref={ref} className={className} />
}

function IconCutoutProbe() {
  const [selected, setSelected] = useState(
    fixtures.find((f) => f.name === "projectproject-app-icon")?.url ??
      fixtures[0]?.url
  )
  const [label, setLabel] = useState("projectproject-app-icon")
  const [image, setImage] = useState<ImageData | null>(null)
  const [tolerance, setTolerance] = useState(24)

  const [mode, setMode] = useState<MatchMode>("global")
  const [treatment, setTreatment] = useState<"sticker" | "full-bleed">(
    "sticker"
  )

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    loadImageData(selected).then((data) => {
      if (!cancelled) setImage(data)
    })
    return () => {
      cancelled = true
    }
  }, [selected])

  const result: CutoutResult | null = useMemo(() => {
    if (!image) return null
    return analyzeCutout(
      { data: image.data, width: image.width, height: image.height },
      { tolerance, mode }
    )
  }, [image, tolerance, mode])

  const onFile = useCallback((file: File) => {
    setLabel(file.name)
    setSelected(URL.createObjectURL(file))
  }, [])

  const showCutout = treatment === "sticker" && result

  return (
    <div
      className="min-h-screen bg-neutral-950 p-8 text-neutral-100"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <header className="mb-6">
        <h1 className="text-lg font-semibold">T-136 cutout probe</h1>
        <p className="text-sm text-neutral-400">
          Throwaway. Drop any image anywhere on this page to test it.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {fixtures.map((fixture) => (
          <button
            key={fixture.name}
            onClick={() => {
              setSelected(fixture.url)
              setLabel(fixture.name)
            }}
            className={`rounded-md border px-3 py-1.5 text-xs transition-colors active:scale-[0.97] ${
              label === fixture.name
                ? "border-blue-400 bg-blue-500/20 text-blue-100"
                : "border-neutral-700 text-neutral-300 hover:bg-neutral-800"
            }`}
            style={{ transitionDuration: "100ms" }}
          >
            {fixture.name}
          </button>
        ))}
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
          <Slider
            size="compact"
            label="Tolerance"
            min={0}
            max={160}
            value={tolerance}
            onChange={(value) => setTolerance(value as number)}
          />
          <div className="flex gap-2">
            {(["global", "grow"] as Array<MatchMode>).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  mode === m
                    ? "border-blue-400 bg-blue-500/20"
                    : "border-neutral-700 hover:bg-neutral-800"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(["sticker", "full-bleed"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTreatment(t)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
                  treatment === t
                    ? "border-blue-400 bg-blue-500/20"
                    : "border-neutral-700 hover:bg-neutral-800"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {result && (
            <div
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                result.clean
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-amber-500/15 text-amber-300"
              }`}
            >
              {result.clean
                ? "Clean cutout — offer the sticker"
                : "Cutout rejected — fall back to full-bleed"}
            </div>
          )}

          {result && (
            <table className="w-full text-xs">
              <tbody>
                {result.checks.map((check) => (
                  <tr key={check.id} className="border-t border-neutral-800">
                    <td className="py-1.5 text-neutral-400">{check.label}</td>
                    <td className="py-1.5 text-right tabular-nums text-neutral-200">
                      {check.value < 1
                        ? `${(check.value * 100).toFixed(1)}%`
                        : check.value.toFixed(1)}
                    </td>
                    <td className="w-6 py-1.5 text-right">
                      <span
                        className={
                          check.passed ? "text-emerald-400" : "text-red-400"
                        }
                      >
                        {check.passed ? "✓" : "✗"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <figure>
            <figcaption className="mb-2 text-xs text-neutral-400">
              Source
            </figcaption>
            {image && (
              <CutoutCanvas
                source={image}
                alpha={null}
                className="w-full rounded-lg border border-neutral-800"
              />
            )}
          </figure>
          <figure>
            <figcaption className="mb-2 text-xs text-neutral-400">
              Flood-fill {treatment === "full-bleed" && "(full-bleed)"}
            </figcaption>
            <div
              className="overflow-hidden rounded-lg border border-neutral-800"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(#3a3a3a 0% 25%, #2a2a2a 0% 50%)",
                backgroundSize: "24px 24px"
              }}
            >
              {image && (
                <CutoutCanvas
                  source={image}
                  alpha={showCutout ? result.alpha : null}
                  className="w-full"
                />
              )}
            </div>
          </figure>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <p className="mb-4 text-xs text-neutral-400">
          At project icon size, on both surfaces
        </p>
        {(
          [["Flood-fill", image, showCutout ? result.alpha : null]] as const
        ).map(([rowLabel, rowSource, rowAlpha]) => (
          <div key={rowLabel} className="mb-4 flex items-center gap-6">
            <span className="w-20 text-xs text-neutral-500">{rowLabel}</span>
            {(["#0a0a0a", "#ffffff"] as const).map((bg) => (
              <div
                key={bg}
                className="flex items-center gap-4 rounded-lg p-4"
                style={{ background: bg }}
              >
                {[64, 40, 24].map((size) => (
                  <div
                    key={size}
                    className="flex items-center justify-center overflow-hidden"
                    style={{
                      width: size,
                      height: size,
                      borderRadius: treatment === "sticker" ? 0 : size * 0.25
                    }}
                  >
                    {rowSource ? (
                      <CutoutCanvas
                        source={rowSource}
                        alpha={rowAlpha}
                        className="h-full w-full [filter:drop-shadow(0_0_1px_rgba(255,255,255,0.9))_drop-shadow(0_1px_2px_rgba(0,0,0,0.45))]"
                      />
                    ) : (
                      <div className="h-full w-full rounded border border-dashed border-neutral-700" />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
