import { useEffect, useRef, useSyncExternalStore } from "react"
import logoRaw from "@/public/logo/logo.svg?raw"

const themedLogo = logoRaw
  .replace(/fill="#FEFEFE"/g, 'fill="var(--foreground)"')
  .replace(/fill="#807F7F"/g, 'fill="var(--muted-foreground)"')
  .replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1")
  .replace(/<svg([^>]*?)\sheight="[^"]*"/, "<svg$1")

function bandGradient(
  angle: number,
  baseOpacity: number,
  bandWidth: number,
  center: number
): string {
  const dim = `rgba(0,0,0,${baseOpacity})`
  return `linear-gradient(${angle}deg, ${dim} ${center - bandWidth}%, #000 ${center}%, ${dim} ${center + bandWidth}%)`
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
      mq.addEventListener("change", cb)
      return () => mq.removeEventListener("change", cb)
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  )
}

type LoaderProps = {
  size?: number | string
  className?: string
  speed?: number
  angle?: number
  baseOpacity?: number
  bandWidth?: number
  travel?: number
  paused?: boolean
}

export function Loader({
  size = 96,
  className,
  speed = 1.8,
  angle = 81,
  baseOpacity = 0.32,
  bandWidth = 69,
  travel = 1,
  paused = false
}: LoaderProps) {
  const ref = useRef<HTMLDivElement>(null)
  const reduced = usePrefersReducedMotion()
  const paramsRef = useRef({ speed, angle, baseOpacity, bandWidth, travel })
  paramsRef.current = { speed, angle, baseOpacity, bandWidth, travel }
  const still = paused || reduced

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (still) {
      el.style.webkitMaskImage = "none"
      el.style.maskImage = "none"
      return
    }
    let raf = 0
    let start = 0
    const tick = (t: number) => {
      if (!start) start = t
      const { speed, angle, baseOpacity, bandWidth, travel } = paramsRef.current
      const phase = ((t - start) / (speed * 1000)) % 1
      const center = (-travel + phase * (1 + 2 * travel)) * 100
      const g = bandGradient(angle, baseOpacity, bandWidth, center)
      el.style.webkitMaskImage = g
      el.style.maskImage = g
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [still])

  const dim = typeof size === "number" ? `${size}px` : size
  const initial = bandGradient(angle, baseOpacity, bandWidth, -travel * 100)

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: dim,
        height: dim,
        WebkitMaskImage: still ? "none" : initial,
        maskImage: still ? "none" : initial,
        WebkitMaskSize: "100% 100%",
        maskSize: "100% 100%",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat"
      }}
    >
      <span
        className="block size-full [&>svg]:size-full"
        dangerouslySetInnerHTML={{ __html: themedLogo }}
      />
    </div>
  )
}
