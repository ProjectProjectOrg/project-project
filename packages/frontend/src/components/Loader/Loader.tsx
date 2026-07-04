import { useMemo, useSyncExternalStore } from "react"
import { type Animation, animations } from "./animations"
import {
  DEFAULT_UNIFORMS,
  type DitherUniforms
} from "./dither-shader"
import { DitherCanvas } from "./DitherCanvas"

export { breathingP } from "./animations"

const defaultAnimation = animations[0].fn

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
  animation?: Animation
}

export function Loader({
  size = 96,
  className,
  speed = 1,
  paused = false,
  uniforms,
  ditherCells,
  animation = defaultAnimation
}: LoaderProps) {
  const reduced = usePrefersReducedMotion()
  const merged = useMemo(
    () => ({ ...DEFAULT_UNIFORMS, ...uniforms }),
    [uniforms]
  )
  const getFrame = useMemo(
    () =>
      reduced
        ? () => ({ p: 0.5, shift: [0, 0] as [number, number] })
        : (elapsed: number) => animation(elapsed * (speed || 1)),
    [reduced, animation, speed]
  )
  const dim = typeof size === "number" ? `${size}px` : size

  return (
    <DitherCanvas
      className={className}
      style={{ width: dim, height: dim }}
      getFrame={getFrame}
      paused={paused || reduced}
      uniforms={merged}
      ditherCells={ditherCells}
    />
  )
}
