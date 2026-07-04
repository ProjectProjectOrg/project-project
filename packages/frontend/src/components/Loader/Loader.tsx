import { useMemo, useSyncExternalStore } from "react"
import {
  DEFAULT_UNIFORMS,
  type DitherUniforms
} from "./dither-shader"
import { DitherCanvas } from "./DitherCanvas"

export function breathingP(elapsedMs: number, periodMs: number): number {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * elapsedMs) / periodMs)
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
  paused?: boolean
  uniforms?: Partial<DitherUniforms>
  ditherCells?: number
}

export function Loader({
  size = 96,
  className,
  speed = 1,
  paused = false,
  uniforms,
  ditherCells
}: LoaderProps) {
  const reduced = usePrefersReducedMotion()
  const merged = useMemo(
    () => ({ ...DEFAULT_UNIFORMS, ...uniforms }),
    [uniforms]
  )
  const period = 4000 / (speed || 1)
  const getP = useMemo(
    () =>
      reduced
        ? () => 0.5
        : (elapsed: number) => breathingP(elapsed, period),
    [reduced, period]
  )
  const dim = typeof size === "number" ? `${size}px` : size

  return (
    <DitherCanvas
      className={className}
      style={{ width: dim, height: dim }}
      getP={getP}
      paused={paused || reduced}
      uniforms={merged}
      ditherCells={ditherCells}
    />
  )
}
