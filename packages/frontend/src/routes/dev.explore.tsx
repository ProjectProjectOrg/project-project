import { createFileRoute } from "@tanstack/react-router"
import { DialRoot, useDialKit } from "dialkit"
import "dialkit/styles.css"
import { Loader } from "@/components/Loader"

export const Route = createFileRoute("/dev/explore")({
  component: ExplorePage
})

function ExplorePage() {
  const c = useDialKit("Shimmer", {
    speed: [1.8, 0.3, 5, 0.1],
    angle: [81, 0, 180, 1],
    baseOpacity: [0.32, 0, 1, 0.01],
    bandWidth: [69, 4, 90, 1],
    travel: [1, 0.1, 1.5, 0.05],
    paused: false
  })
  const common = {
    speed: c.speed,
    angle: c.angle,
    baseOpacity: c.baseOpacity,
    bandWidth: c.bandWidth,
    travel: c.travel,
    paused: c.paused
  }
  const sizes = [24, 48, 96, 160]

  return (
    <div className="mx-auto max-w-4xl space-y-10 p-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Shimmer loader</h1>
        <p className="text-muted-foreground text-sm">
          The real logo revealed through a sweeping gradient mask
          (theme-aware). Dial it with the panel (top-right).
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">Sizes (app background)</h2>
        <div className="flex flex-wrap items-end gap-8">
          {sizes.map((s) => (
            <div key={s} className="flex flex-col items-center gap-2">
              <Loader size={s} {...common} />
              <span className="text-muted-foreground text-xs">{s}px</span>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <div className="flex items-center justify-center rounded-lg border p-10">
          <Loader size={140} {...common} />
        </div>
        <div className="bg-muted flex items-center justify-center rounded-lg p-10">
          <Loader size={140} {...common} />
        </div>
      </section>

      <DialRoot position="top-right" defaultOpen />
    </div>
  )
}
