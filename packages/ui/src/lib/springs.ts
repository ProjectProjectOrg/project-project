import type { Variants } from "motion/react"

export const springs = {
  fast: {
    type: "spring" as const,
    duration: 0.08,
    bounce: 0
  },
  moderate: {
    type: "spring" as const,
    duration: 0.16,
    bounce: 0.15
  },
  slow: {
    type: "spring" as const,
    duration: 0.24,
    bounce: 0.15
  }
} as const

const standardEase = [0.22, 1, 0.36, 1] as const

export const standardEaseCss = `cubic-bezier(${standardEase.join(", ")})`

export const transitions = {
  fade: { duration: 0.15, ease: standardEase },
  layout: { duration: 0.22, ease: standardEase },
  morph: { duration: 0.26, ease: standardEase },
  pop: { duration: 0.18, ease: standardEase },
  presence: { duration: 0.18, ease: standardEase }
} as const

export const sliderSprings = {
  fast: { ...springs.fast, exit: { duration: 0.06 } },
  moderate: { ...springs.moderate, exit: { duration: 0.12 } },
  slow: { ...springs.slow, exit: { duration: 0.16 } }
} as const

export const spring = {
  fast: {
    type: "spring" as const,
    duration: 0.08,
    bounce: 0,
    exit: { duration: 0.06 }
  },
  moderate: {
    type: "spring" as const,
    duration: 0.16,
    bounce: 0,
    exit: { duration: 0.12 }
  },
  slow: {
    type: "spring" as const,
    duration: 0.24,
    bounce: 0.12,
    exit: { duration: 0.16 }
  }
} as const

export const exitFallbackMs = (tier: { exit: { duration: number } }) =>
  Math.round(tier.exit.duration * 1000) + 100

// A value swap: the old value blurs and fades out while the new one blurs
// and fades in, on the same 180ms ease-in-out. Both curves are gentle at
// the ends, so neither label pops in or vanishes abruptly, and they cross
// at the midpoint, half faded and about 2px blurred. (An ease-in exit
// dropped steepest at its last frame and read as the old value being cut.)
const blurSwapTiming = {
  type: "tween",
  duration: 0.18,
  ease: "easeInOut"
} as const

export const blurSwap: Variants = {
  shown: {
    opacity: 1,
    filter: "blur(0px)",
    transition: blurSwapTiming
  },
  hidden: {
    opacity: 0,
    filter: "blur(4px)",
    transition: blurSwapTiming
  }
}
