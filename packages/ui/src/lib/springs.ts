const standardEase = [0.22, 1, 0.36, 1] as const

export const standardEaseCss = `cubic-bezier(${standardEase.join(", ")})`

export const transitions = {
  fade: { duration: 0.15, ease: standardEase },
  layout: { duration: 0.22, ease: standardEase },
  morph: { duration: 0.26, ease: standardEase },
  pop: { duration: 0.18, ease: standardEase },
  presence: { duration: 0.18, ease: standardEase }
} as const

// The one set of springs: snap, fast, moderate and slow, each with the
// duration of its exit animation. Snap is for a highlight that follows the
// pointer through menu rows, where anything slower trails behind it.
export const spring = {
  snap: {
    type: "spring" as const,
    duration: 0.05,
    bounce: 0,
    exit: { duration: 0.05 }
  },
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
