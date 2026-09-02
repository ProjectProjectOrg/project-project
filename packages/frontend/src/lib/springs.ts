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
